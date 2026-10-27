import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { parseStoredSession, requestPlayerSession, sessionEndpointFromWebSocket, type PlayerSession } from '@rps/game-client/session';
import { getGameWebSocketUrl } from '../config';

const keychainService = 'com.dangervalley.ripsy.player-session';
const listeners = new Set<(session: PlayerSession) => void>();
let renewal: Promise<PlayerSession> | null = null;

/** Validate cached credentials with the server, not just their local expiry.
 * A revoked session becomes a new anonymous identity, never a wallet/payment.
 * Publish only after secure persistence, and share one renewal across screens.
 */
export function refreshPlayerIdentity(): Promise<PlayerSession> {
  if (renewal) return renewal;
  renewal = (async () => {
    const credentials = await Keychain.getGenericPassword({ service: keychainService });
    const stored = parseStoredSession(credentials ? credentials.password : null);
    const next = await requestPlayerSession(sessionEndpointFromWebSocket(getGameWebSocketUrl()), stored?.token);
    const saved = await Keychain.setGenericPassword('ripsy-player', JSON.stringify(next), {
      service: keychainService,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    if (!saved) throw new Error('Could not save your player session securely. Please try again.');
    listeners.forEach(listener => listener(next));
    return next;
  })().finally(() => { renewal = null; });
  return renewal;
}

export function usePlayerIdentity() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let restored = false;
    let attempting = false;
    let retryDelay = 5_000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const receive = (next: PlayerSession) => {
      if (active) {
        restored = true;
        clearTimeout(retryTimer);
        setSession(next);
        setError(null);
      }
    };
    listeners.add(receive);
    const restore = () => {
      if (!active || restored || attempting || (AppState.currentState && AppState.currentState !== 'active')) return;
      clearTimeout(retryTimer);
      attempting = true;
      refreshPlayerIdentity().catch(cause => {
        if (!active || restored) return;
        setError(cause instanceof Error ? cause.message : 'Could not create a player session');
        // Startup can happen offline. Retry only the HTTP session, never a
        // wallet or saved purchase; do not strand Home after connectivity returns.
        retryTimer = setTimeout(restore, retryDelay);
        retryDelay = Math.min(30_000, retryDelay * 2);
      }).finally(() => { attempting = false; });
    };
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') restore();
    });
    restore();
    return () => {
      active = false;
      clearTimeout(retryTimer);
      subscription.remove();
      listeners.delete(receive);
    };
  }, []);

  return { playerId: session?.playerId ?? '', sessionToken: session?.token ?? '', isReady: Boolean(session), error };
}
