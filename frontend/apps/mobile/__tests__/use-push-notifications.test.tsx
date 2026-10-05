import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Renderer from 'react-test-renderer';
import { usePushNotifications } from '../src/hooks/use-push-notifications';
import { getPushPermissionState, registerPushInstallation, enableAndRegisterPush } from '../src/push-notifications';

jest.mock('../src/push-notifications', () => ({ getPushPermissionState: jest.fn(), registerPushInstallation: jest.fn(), enableAndRegisterPush: jest.fn() }));
let foreground: (state: AppStateStatus) => void;
let tree: Renderer.ReactTestRenderer;
let current: ReturnType<typeof usePushNotifications>;
const remove = jest.fn();
function Probe() { current = usePushNotifications('session'); return null; }
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getPushPermissionState).mockResolvedValue('denied');
  jest.mocked(registerPushInstallation).mockResolvedValue(undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove }; });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); });
async function mount() { await Renderer.act(async () => { tree = Renderer.create(<Probe />); }); }

test('refreshes permission on return from Settings without asking again', async () => {
  await mount(); expect(current.status).toBe('denied');
  jest.mocked(getPushPermissionState).mockResolvedValue('enabled');
  await Renderer.act(async () => foreground('active'));
  expect(current.status).toBe('enabled'); expect(registerPushInstallation).toHaveBeenCalledWith('session');
  expect(enableAndRegisterPush).not.toHaveBeenCalled();
});
test('does not re-read for inactive/background and removes its listener', async () => {
  await mount();
  await Renderer.act(async () => { foreground('inactive'); foreground('background'); });
  expect(getPushPermissionState).toHaveBeenCalledTimes(1);
  await Renderer.act(() => tree.unmount()); expect(remove).toHaveBeenCalledTimes(1);
});
test('a failed foreground refresh is recoverable, not an invented enabled state', async () => {
  await mount(); jest.mocked(getPushPermissionState).mockRejectedValue(new Error('unavailable'));
  await Renderer.act(async () => foreground('active'));
  expect(current.status).toBe('error'); expect(enableAndRegisterPush).not.toHaveBeenCalled();
});
test('ignores a stale permission read after a newer foreground refresh', async () => {
  let complete!: (value: 'denied') => void;
  jest.mocked(getPushPermissionState).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  await mount();
  jest.mocked(getPushPermissionState).mockResolvedValue('enabled');
  await Renderer.act(async () => foreground('active'));
  await Renderer.act(async () => complete('denied'));
  expect(current.status).toBe('enabled');
});
