import React from 'react';
import { Linking } from 'react-native';
import { getApps } from '@react-native-firebase/app';
import { getInitialNotification } from '@react-native-firebase/messaging';
import Renderer from 'react-test-renderer';
import App from '../App';
import { loadActiveGameId } from '../src/storage/active-game';
import { StartupSplash } from '../src/components/startup-splash';

const mockNavigate = jest.fn();
const mockNavigationRef = { isReady: () => true, getCurrentRoute: () => ({ name: 'Home' }), navigate: mockNavigate };
const mockAlerts = { notification: { gameId: 'abcdef12', title: 'Your turn', body: 'Your opponent moved.' }, dismiss: jest.fn() };
jest.mock('../src/hooks/use-game-push-alerts', () => ({ useGamePushAlerts: () => mockAlerts }));
jest.mock('../src/storage/active-game', () => ({ loadActiveGameId: jest.fn(), saveActiveGameId: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/screens/home-screen', () => ({ HomeScreen: () => null }));
jest.mock('../src/screens/game-screen', () => ({ GameScreen: () => null, ComputerGameScreen: () => null }));
jest.mock('../src/screens/shop-screen', () => ({ ShopScreen: () => null }));
jest.mock('../src/screens/army-screen', () => ({ ArmyScreen: () => null }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigationContainerRef: () => mockNavigationRef,
  NavigationContainer: ({ ref: _ref, ...props }: { ref?: unknown }) => require('react').createElement('NavigationHost', props),
}));
jest.mock('@react-navigation/native-stack', () => ({ createNativeStackNavigator: () => ({
  Navigator: ({ children }: { children: React.ReactNode }) => children,
  Screen: () => null,
}) }));

let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.mocked(getApps).mockReturnValue([{} as ReturnType<typeof getApps>[number]]);
  jest.mocked(loadActiveGameId).mockResolvedValue('11223344');
  jest.mocked(getInitialNotification).mockResolvedValue(null);
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.mocked(getApps).mockReturnValue([]); jest.restoreAllMocks(); });
async function mount({ artworkReady = true } = {}) {
  await Renderer.act(async () => { tree = Renderer.create(<App />); });
  if (artworkReady) await Renderer.act(() => tree.root.findByType(StartupSplash).props.onArtworkReady());
}
function navigation() { return tree.root.find(node => typeof node.type === 'string' && String(node.type) === 'NavigationHost'); }

test('illustrated splash lasts only while real restoration is pending', async () => {
  let restore!: (id: string | null) => void;
  jest.mocked(loadActiveGameId).mockReturnValueOnce(new Promise(resolve => { restore = resolve; }));
  await mount();
  expect(tree.root.findAllByType(StartupSplash)).toHaveLength(1);
  expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.type) === 'NavigationHost')).toHaveLength(0);
  await Renderer.act(async () => { restore('11223344'); });
  expect(tree.root.findAllByType(StartupSplash)).toHaveLength(0);
  expect(navigation().props.initialState).toEqual({ index: 0, routes: [{ name: 'Home', params: { restoreGameId: '11223344' } }] });
});

test('a failed saved-game lookup dismisses splash and opens Home', async () => {
  jest.mocked(loadActiveGameId).mockRejectedValueOnce(new Error('Storage unavailable'));
  await mount();
  expect(tree.root.findAllByType(StartupSplash)).toHaveLength(0);
  expect(navigation().props.initialState).toBeUndefined();
});

test('does not recycle loading splash images into Home after fast restoration', async () => {
  await mount({ artworkReady: false });
  expect(tree.root.findAllByType(StartupSplash)).toHaveLength(1);
  expect(tree.root.findAll(node => typeof node.type === 'string' && String(node.type) === 'NavigationHost')).toHaveLength(0);
  await Renderer.act(() => tree.root.findByType(StartupSplash).props.onArtworkReady());
  expect(tree.root.findAllByType(StartupSplash)).toHaveLength(0);
  expect(navigation()).toBeDefined();
});

test('a cold-start notification is consumed once and survives the navigation restoration check', async () => {
  jest.mocked(getInitialNotification).mockResolvedValueOnce({ data: { gameId: 'ABCDEF12', event: 'turn' } });
  await mount();
  expect(getInitialNotification).toHaveBeenCalledTimes(1);
  await expect(navigation().props.linking.getInitialURL()).resolves.toBe('https://www.ripsy.fun/game/abcdef12');
  await expect(navigation().props.linking.getInitialURL()).resolves.toBe('https://www.ripsy.fun/game/abcdef12');
  expect(getInitialNotification).toHaveBeenCalledTimes(1);
  expect(navigation().props.initialState).toBeUndefined();
});
test('saved-game lookup failure does not discard a notification link', async () => {
  jest.mocked(loadActiveGameId).mockRejectedValueOnce(new Error('Storage unavailable'));
  jest.mocked(getInitialNotification).mockResolvedValueOnce({ data: { gameId: 'abcdef12' } });
  await mount();
  await expect(navigation().props.linking.getInitialURL()).resolves.toBe('https://www.ripsy.fun/game/abcdef12');
});
test('without an explicit link the saved game is only offered to Home for validation', async () => {
  await mount();
  expect(navigation().props.initialState).toEqual({ index: 0, routes: [{ name: 'Home', params: { restoreGameId: '11223344' } }] });
});
test('foreground alert tap navigates to that room, not the saved or current room', async () => {
  await mount();
  await Renderer.act(async () => navigation().props.onReady());
  const open = tree.root.find(node => node.props.accessibilityHint === 'Open this battle' && typeof node.props.onPress === 'function');
  await Renderer.act(async () => open.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('Game', { gameId: 'abcdef12' });
  expect(mockAlerts.dismiss).toHaveBeenCalledTimes(1);
});
