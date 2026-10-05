import { getApp, getApps } from '@react-native-firebase/app';
import { getId, getInstallations } from '@react-native-firebase/installations';
import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  registerDeviceForRemoteMessages,
  setBackgroundMessageHandler,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { checkNotifications, requestNotifications, RESULTS } from 'react-native-permissions';
import { getPushRegistrationUrl } from './config';
import { normalizeRoomCode } from './invitations';

export type PushPermissionState = 'checking' | 'prompt' | 'enabled' | 'denied' | 'unavailable' | 'error';

export interface GamePushNotification {
  gameId: string;
  title: string;
  body: string;
  deliveryId?: string;
}

export function gamePushFromMessage(message: RemoteMessage | null): GamePushNotification | null {
  const rawGameId = message?.data?.gameId;
  const gameId = normalizeRoomCode(typeof rawGameId === 'string' ? rawGameId : '');
  const event = message?.data?.event;
  if (!gameId || !['turn', 'tie', 'opponent_joined', 'game_finished'].includes(String(event))) return null;
  return {
    gameId,
    title: message?.notification?.title?.slice(0, 120) || 'Battle update',
    body: message?.notification?.body?.slice(0, 320) || 'Open your RIPSY battle to see the latest update.',
    deliveryId: message?.messageId,
  };
}

export function subscribeToForegroundGamePush(listener: (notification: GamePushNotification) => void) {
  if (!hasFirebaseApp()) return () => undefined;
  try {
    return onMessage(getMessaging(getApp()), async message => {
      const notification = gamePushFromMessage(message);
      if (notification) listener(notification);
    });
  } catch {
    return () => undefined;
  }
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!hasFirebaseApp()) return 'unavailable';
  const { status } = await checkNotifications();
  if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) return 'enabled';
  if (status === RESULTS.BLOCKED) return 'denied';
  if (status === RESULTS.UNAVAILABLE) return 'unavailable';
  return 'prompt';
}

export async function enableAndRegisterPush(sessionToken: string): Promise<PushPermissionState> {
  if (!hasFirebaseApp()) return 'unavailable';
  const { status } = await requestNotifications(['alert', 'badge', 'sound']);
  if (status !== RESULTS.GRANTED && status !== RESULTS.LIMITED) {
    return status === RESULTS.BLOCKED ? 'denied' : 'prompt';
  }
  await registerPushInstallation(sessionToken);
  return 'enabled';
}

export async function registerPushInstallation(sessionToken: string) {
  const app = getApp();
  const messaging = getMessaging(app);
  await registerDeviceForRemoteMessages(messaging);
  await getToken(messaging);
  const fid = await getId(getInstallations(app));
  const response = await fetch(getPushRegistrationUrl(), {
    method: 'POST',
    headers: { authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fid }),
  });
  if (!response.ok) throw new Error(`Push registration failed (${response.status})`);
}

export async function getInitialPushUrl() {
  if (!hasFirebaseApp()) return null;
  try {
    return pushUrlFromMessage(await getInitialNotification(getMessaging(getApp())));
  } catch {
    return null;
  }
}

export function subscribeToPushUrls(listener: (url: string) => void) {
  if (!hasFirebaseApp()) return () => undefined;
  try {
    return onNotificationOpenedApp(getMessaging(getApp()), message => {
      const url = pushUrlFromMessage(message);
      if (url) listener(url);
    });
  } catch {
    return () => undefined;
  }
}

export function installBackgroundPushHandler() {
  if (!hasFirebaseApp()) return;
  try {
    setBackgroundMessageHandler(getMessaging(getApp()), async () => undefined);
  } catch {
    // Firebase config is intentionally optional for local builds.
  }
}

function pushUrlFromMessage(message: RemoteMessage | null) {
  const rawGameId = message?.data?.gameId;
  const gameId = normalizeRoomCode(typeof rawGameId === 'string' ? rawGameId : '');
  return gameId ? `https://www.ripsy.fun/game/${gameId}` : null;
}

function hasFirebaseApp() {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}
