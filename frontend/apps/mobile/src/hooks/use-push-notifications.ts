import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  enableAndRegisterPush,
  getPushPermissionState,
  registerPushInstallation,
  type PushPermissionState,
} from '../push-notifications';

export function usePushNotifications(sessionToken: string) {
  const [status, setStatus] = useState<PushPermissionState>('checking');

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const currentRevision = ++revision;
      getPushPermissionState()
        .then(async nextStatus => {
          if (!active || currentRevision !== revision) return;
          if (nextStatus === 'enabled' && sessionToken) await registerPushInstallation(sessionToken);
          if (active && currentRevision === revision) setStatus(nextStatus);
        })
        .catch(() => { if (active && currentRevision === revision) setStatus('error'); });
    };
    refresh();
    // Re-read after the user returns from system notification settings. Never prompt here.
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [sessionToken]);

  const enable = useCallback(async () => {
    if (!sessionToken) return;
    setStatus('checking');
    try {
      setStatus(await enableAndRegisterPush(sessionToken));
    } catch {
      setStatus('error');
    }
  }, [sessionToken]);

  return { status, enable };
}
