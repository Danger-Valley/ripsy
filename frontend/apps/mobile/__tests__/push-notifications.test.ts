import { getApps } from '@react-native-firebase/app';
import { getId } from '@react-native-firebase/installations';
import { checkNotifications, requestNotifications, RESULTS } from 'react-native-permissions';
import { getInitialNotification, getToken, onMessage, onNotificationOpenedApp, registerDeviceForRemoteMessages, type RemoteMessage } from '@react-native-firebase/messaging';
import { enableAndRegisterPush, gamePushFromMessage, getInitialPushUrl, getPushPermissionState, registerPushInstallation, subscribeToForegroundGamePush, subscribeToPushUrls } from '../src/push-notifications';

const mockedGetApps = getApps as jest.MockedFunction<typeof getApps>;
const message: RemoteMessage = { messageId: 'delivery-one', data: { event: 'turn', gameId: 'ABCDEF12', url: 'https://untrusted.example' }, notification: { title: 'Your turn', body: 'Your opponent moved.' } };

beforeEach(() => jest.clearAllMocks());

afterEach(() => {
  mockedGetApps.mockReturnValue([]);
  jest.restoreAllMocks();
});

test('validates a battle alert and normalizes its room code', () => {
  expect(gamePushFromMessage(message)).toEqual({ gameId: 'abcdef12', title: 'Your turn', body: 'Your opponent moved.', deliveryId: 'delivery-one' });
});

test.each([null, { data: { event: 'turn', gameId: 'not-a-room' } }, { data: { event: 'unknown', gameId: 'abcdef12' } }])('rejects a malformed or unrelated foreground message %j', value => {
  expect(gamePushFromMessage(value)).toBeNull();
});

test('foreground subscription forwards valid game alerts and removes its listener', async () => {
  mockedGetApps.mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  const remove = jest.fn();
  jest.mocked(onMessage).mockReturnValueOnce(remove);
  const listener = jest.fn();
  const unsubscribe = subscribeToForegroundGamePush(listener);
  const receive = jest.mocked(onMessage).mock.calls[0]![1];
  await receive(message);
  await receive({ data: { event: 'turn', gameId: 'invalid' } });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener.mock.calls[0]![0].gameId).toBe('abcdef12');
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('optional Firebase builds do not subscribe to foreground messages', () => {
  const listener = jest.fn();
  subscribeToForegroundGamePush(listener)();
  expect(onMessage).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});

test('cold-start taps use the validated room, never a supplied external URL', async () => {
  mockedGetApps.mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  jest.mocked(getInitialNotification).mockResolvedValueOnce(message);
  await expect(getInitialPushUrl()).resolves.toBe('https://www.ripsy.fun/game/abcdef12');
  jest.mocked(getInitialNotification).mockResolvedValueOnce({ data: { gameId: 'invalid' } });
  await expect(getInitialPushUrl()).resolves.toBeNull();
});

test('background notification taps open the correct game and unsubscribe', () => {
  mockedGetApps.mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  const remove = jest.fn();
  jest.mocked(onNotificationOpenedApp).mockReturnValueOnce(remove);
  const listener = jest.fn();
  const unsubscribe = subscribeToPushUrls(listener);
  const receive = jest.mocked(onNotificationOpenedApp).mock.calls[0]![1];
  receive(message);
  receive({ data: { gameId: 'invalid' } });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith('https://www.ripsy.fun/game/abcdef12');
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('reports push as unavailable when the native Firebase app is not configured', async () => {
  await expect(getPushPermissionState()).resolves.toBe('unavailable');
  expect(checkNotifications).not.toHaveBeenCalled();
});

test('configured Firebase and never-requested permission expose the enable action without prompting automatically', async () => {
  mockedGetApps.mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  jest.mocked(checkNotifications).mockResolvedValueOnce({ status: RESULTS.DENIED, settings: {} });
  await expect(getPushPermissionState()).resolves.toBe('prompt');
  expect(checkNotifications).toHaveBeenCalledTimes(1);
  expect(requestNotifications).not.toHaveBeenCalled();
});

test('explicit enable requests notification permission and registers the installation after approval', async () => {
  mockedGetApps.mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  jest.mocked(requestNotifications).mockResolvedValueOnce({ status: RESULTS.GRANTED, settings: {} });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
  await expect(enableAndRegisterPush('session-token')).resolves.toBe('enabled');
  expect(requestNotifications).toHaveBeenCalledWith(['alert', 'badge', 'sound']);
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/push/installations', expect.objectContaining({ method: 'POST' }));
});

test('registers the Firebase installation with the authenticated backend', async () => {
  mockedGetApps.mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

  await registerPushInstallation('session-token');

  expect(registerDeviceForRemoteMessages).toHaveBeenCalled();
  expect(getToken).toHaveBeenCalled();
  expect(getId).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/push/installations', {
    method: 'POST',
    headers: { authorization: 'Bearer session-token', 'content-type': 'application/json' },
    body: JSON.stringify({ fid: 'test-installation-id' }),
  });
});
