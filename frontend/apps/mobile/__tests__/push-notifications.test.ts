import { getApps } from '@react-native-firebase/app';
import { getId } from '@react-native-firebase/installations';
import { getToken, registerDeviceForRemoteMessages } from '@react-native-firebase/messaging';
import { getPushPermissionState, registerPushInstallation } from '../src/push-notifications';

const mockedGetApps = getApps as jest.MockedFunction<typeof getApps>;

afterEach(() => {
  mockedGetApps.mockReturnValue([]);
  jest.restoreAllMocks();
});

test('reports push as unavailable when the native Firebase app is not configured', async () => {
  await expect(getPushPermissionState()).resolves.toBe('unavailable');
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
