import { useCallback, useEffect, useState } from 'react';
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
    getPushPermissionState()
      .then(async nextStatus => {
        if (nextStatus === 'enabled' && sessionToken) await registerPushInstallation(sessionToken);
        if (active) setStatus(nextStatus);
      })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
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
