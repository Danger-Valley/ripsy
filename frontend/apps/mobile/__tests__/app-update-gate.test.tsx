import { useEffect } from 'react';
import { BackHandler, Linking, ScrollView, StyleSheet, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { disabledUpdatePolicy } from '@rps/core/app-updates';
import { AppUpdateGate } from '../src/updates/app-update-gate';
import { RequiredUpdateScreen } from '../src/updates/required-update-screen';
import { useAppUpdate } from '../src/updates/use-app-update';
import { StartupSplash } from '../src/components/startup-splash';
import { ToyHomeButton } from '../src/components/toy-home-controls';
import { useGamePushAlerts } from '../src/hooks/use-game-push-alerts';
import App from '../App';

jest.mock('../src/updates/use-app-update', () => ({ useAppUpdate: jest.fn() }));
jest.mock('../src/hooks/use-game-push-alerts', () => ({ useGamePushAlerts: jest.fn() }));

const app = { channel: 'ios' as const, build: 56, version: '1.0.0' };
const rule = { ...disabledUpdatePolicy().ios, minimumBuild: 57, storeUrl: 'https://testflight.apple.com/join/VU1k1zfy' };
const mounted = jest.fn(); const unmounted = jest.fn(); const check = jest.fn();
let tree: Renderer.ReactTestRenderer | undefined;
function Game() {
  useEffect(() => { mounted(); return unmounted; }, []);
  return <Text>GAME NAVIGATION</Text>;
}
function state(overrides: Partial<ReturnType<typeof useAppUpdate>> = {}) {
  jest.mocked(useAppUpdate).mockReturnValue({ app, checking: false, refreshing: false, required: rule, error: false, refresh: check, ...overrides });
}
async function settleSplash() { await Renderer.act(() => tree!.root.findByType(StartupSplash).props.onArtworkReady()); }
beforeEach(() => {
  jest.clearAllMocks(); state();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree?.unmount());
  tree = undefined; jest.restoreAllMocks();
});

test('mandatory gate replaces navigation rather than showing a dismissible overlay, rollback restores it', async () => {
  await Renderer.act(async () => { tree = Renderer.create(<AppUpdateGate><Game /></AppUpdateGate>); });
  expect(mounted).not.toHaveBeenCalled();
  await settleSplash();
  expect(tree!.root.findAllByType(Game)).toHaveLength(0);
  expect(tree!.root.findAllByType(RequiredUpdateScreen)).toHaveLength(1);
  expect(tree!.root.findAllByType(ToyHomeButton).map(button => button.props.children)).toEqual(['Update RIPSY', 'Check again']);
  state({ required: null });
  await Renderer.act(() => tree!.update(<AppUpdateGate><Game /></AppUpdateGate>));
  expect(mounted).toHaveBeenCalledTimes(1);
  // A minimum received during a foreground session unmounts gameplay and its subscriptions.
  state();
  await Renderer.act(() => tree!.update(<AppUpdateGate><Game /></AppUpdateGate>));
  expect(unmounted).toHaveBeenCalledTimes(1);
  expect(tree!.root.findAllByType(Game)).toHaveLength(0);
});

test('actual root app does not consume push/invite navigation while blocked', async () => {
  await Renderer.act(async () => { tree = Renderer.create(<App />); });
  await settleSplash();
  expect(tree!.root.findByType(RequiredUpdateScreen)).toBeTruthy();
  expect(useGamePushAlerts).not.toHaveBeenCalled();
});

test('hardware Back is swallowed while required and subscription is removed on unmount', async () => {
  let back!: () => boolean | null | undefined;
  const remove = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => { back = () => listener({} as never); return { remove }; });
  await Renderer.act(async () => { tree = Renderer.create(<RequiredUpdateScreen rule={rule} app={app} refreshing={false} checkFailed={false} onCheck={check} />); });
  expect(back()).toBe(true);
  await Renderer.act(() => tree!.unmount()); tree = undefined;
  expect(remove).toHaveBeenCalledTimes(1);
});

test('Update opens the configured store, never dismisses the gate; Check again really checks', async () => {
  await Renderer.act(async () => { tree = Renderer.create(<RequiredUpdateScreen rule={rule} app={app} refreshing={false} checkFailed={false} onCheck={check} />); });
  expect(Linking.openURL).not.toHaveBeenCalled();
  await Renderer.act(async () => tree!.root.findAllByType(ToyHomeButton)[0].props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith(rule.storeUrl);
  expect(tree!.root.findByType(RequiredUpdateScreen)).toBeTruthy();
  await Renderer.act(() => tree!.root.findAllByType(ToyHomeButton)[1].props.onPress());
  expect(check).toHaveBeenCalledTimes(1);
});

test('Seeker tries dApp Store then configured HTTPS fallback, with an honest error when both fail', async () => {
  const seeker = { ...app, channel: 'seeker' as const };
  const seekerRule = { ...rule, storeUrl: 'solanadappstore://details?id=com.dangervalley.ripsy', fallbackUrl: 'https://www.ripsy.fun/download' };
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No handler'));
  await Renderer.act(async () => { tree = Renderer.create(<RequiredUpdateScreen rule={seekerRule} app={seeker} refreshing={false} checkFailed={false} onCheck={check} />); });
  expect(tree!.root.findAllByType(ToyHomeButton)[0].props.children).toBe('Open dApp Store');
  expect(tree!.root.findAllByType(Text).some(node => node.props.children === 'You have to update the app')).toBe(true);
  await Renderer.act(async () => tree!.root.findAllByType(ToyHomeButton)[0].props.onPress());
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, seekerRule.storeUrl);
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, seekerRule.fallbackUrl);
  jest.mocked(Linking.openURL).mockRejectedValue(new Error('Offline'));
  await Renderer.act(async () => tree!.root.findAllByType(ToyHomeButton)[0].props.onPress());
  const copy = tree!.root.findAllByType(Text).map(text => text.props.children);
  expect(copy).toContain('Could not open the store. Check your connection and try again.');
  expect(tree!.root.findAllByType(Text).find(text => text.props.selectable)?.props.children).toBe(seekerRule.fallbackUrl);
});
test('Seeker always targets its exact dApp Store listing, retaining configured HTTPS as fallback', async () => {
  const seeker = { ...app, channel: 'seeker' as const };
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No handler'));
  await Renderer.act(async () => { tree = Renderer.create(<RequiredUpdateScreen rule={{ ...rule, storeUrl: 'https://www.ripsy.fun/download' }} app={seeker} refreshing={false} checkFailed={false} onCheck={check} />); });
  await Renderer.act(async () => tree!.root.findAllByType(ToyHomeButton)[0].props.onPress());
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'solanadappstore://details?id=com.dangervalley.ripsy');
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, 'https://www.ripsy.fun/download');
});

test('update layout scrolls, clears safe areas and checks never clear the known gate', async () => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 59, bottom: 34, left: 8, right: 9 });
  state({ refreshing: true, error: true });
  await Renderer.act(async () => { tree = Renderer.create(<AppUpdateGate><Game /></AppUpdateGate>); });
  await settleSplash();
  const style = StyleSheet.flatten(tree!.root.findByType(ScrollView).props.contentContainerStyle);
  expect(style).toMatchObject({ paddingTop: 87, paddingBottom: 62, paddingLeft: 28, paddingRight: 29 });
  expect(tree!.root.findAllByType(Game)).toHaveLength(0);
  expect(tree!.root.findAllByType(ToyHomeButton)[1].props.busy).toBe(true);
});
