import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { parseUpdatePolicy, requiredUpdate, type UpdateRule } from '@rps/core/app-updates';
import { getGameWebSocketUrl } from '../config';
import { installedApp } from './app-info';

const service = 'com.dangervalley.ripsy.update-policy-v1';
const requestTimeout = 4000;
const cacheTimeout = 800;

function deadline<T>(promise: Promise<T>, milliseconds: number, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { onTimeout?.(); reject(new Error('Update check timed out')); }, milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function useAppUpdate() {
  const [app] = useState(installedApp);
  const [checking, setChecking] = useState(Boolean(app));
  const [refreshing, setRefreshing] = useState(false);
  const [required, setRequired] = useState<UpdateRule | null>(null);
  const [error, setError] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!app) return;
    const origin = getGameWebSocketUrl().replace(/^ws/, 'http').replace(/\/$/, '');
    let alive = true;
    let fresh = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    // Serialize writes so an earlier check cannot overwrite a later rollback.
    let writes = Promise.resolve<unknown>(undefined);
    const restore = Promise.resolve().then(() => Keychain.getGenericPassword({ service })).then(saved => {
      if (!saved || !alive || fresh) return;
      const cached = JSON.parse(saved.password);
      if (cached.origin !== origin) return;
      setRequired(requiredUpdate(parseUpdatePolicy(cached.policy), app.channel, app.build));
    }).catch(() => undefined);

    const check = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      setRefreshing(true);
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const policy = await deadline((async () => {
          const response = await fetch(`${origin}/mobile/update-policy`, { signal, headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('Update policy unavailable');
          const body = await response.text();
          if (body.length > 16_384) throw new Error('Update policy too large');
          return parseUpdatePolicy(JSON.parse(body));
        })(), requestTimeout, () => controller?.abort());
        if (!alive) return;
        fresh = true;
        setRequired(requiredUpdate(policy, app.channel, app.build));
        setError(false);
        writes = writes.catch(() => undefined).then(() => Keychain.setGenericPassword('update-policy', JSON.stringify({ origin, policy }), {
          service, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        })).catch(() => undefined);
      } catch {
        if (alive) setError(true);
        // No cached minimum: fail open for offline play. Known mandatory policy stays blocking.
      } finally {
        // Storage cannot hold the first launch indefinitely, but a late known gate still applies.
        await deadline(restore, cacheTimeout).catch(() => undefined);
        if (alive) { setChecking(false); setRefreshing(false); }
        inFlight = false;
      }
    };
    const runCheck = () => { check().catch(() => undefined); };
    refreshRef.current = runCheck;
    runCheck();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') runCheck(); });
    // Covers long foreground sessions, without coupling checks to moves, clocks or renders.
    const timer = setInterval(() => { if (AppState.currentState === 'active') runCheck(); }, 60_000);
    return () => {
      alive = false; controller?.abort(); clearInterval(timer); subscription.remove();
      refreshRef.current = () => {};
    };
  }, [app]);
  return { app, checking, refreshing, required, error, refresh };
}
