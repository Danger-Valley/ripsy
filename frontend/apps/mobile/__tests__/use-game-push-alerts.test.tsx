import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Renderer from 'react-test-renderer';
import { useGamePushAlerts } from '../src/hooks/use-game-push-alerts';
import { subscribeToForegroundGamePush, type GamePushNotification } from '../src/push-notifications';

jest.mock('../src/push-notifications', () => ({ subscribeToForegroundGamePush: jest.fn() }));
let receive: (notification: GamePushNotification) => void;
let stateChanged: (state: AppStateStatus) => void;
let tree: Renderer.ReactTestRenderer;
let alerts: ReturnType<typeof useGamePushAlerts>;
const unsubscribe = jest.fn();
const remove = jest.fn();
const originalState = AppState.currentState;
const notification = (gameId = 'abcdef12', deliveryId = 'one'): GamePushNotification => ({ gameId, deliveryId, title: 'Your turn', body: 'Your opponent moved.' });
function Probe({ gameId = null }: { gameId?: string | null }) { alerts = useGamePushAlerts(gameId); return null; }
beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  jest.mocked(subscribeToForegroundGamePush).mockImplementation(listener => { receive = listener; return unsubscribe; });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { stateChanged = listener; return { remove }; });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); AppState.currentState = originalState; jest.restoreAllMocks(); });
async function mount(gameId: string | null = null) { await Renderer.act(async () => { tree = Renderer.create(<Probe gameId={gameId} />); }); }
async function deliver(value = notification()) { await Renderer.act(async () => receive(value)); }

test('the current game is completely silent', async () => {
  await mount('abcdef12'); await deliver();
  expect(alerts.notification).toBeNull();
});
test.each([null, '11223344'])('Home, Army, Shop or another game can show a tappable alert (%s)', async gameId => {
  await mount(gameId); await deliver();
  expect(alerts.notification).toEqual(notification());
});
test('entering the notified room immediately removes its banner', async () => {
  await mount(); await deliver();
  await Renderer.act(async () => tree.update(<Probe gameId="abcdef12" />));
  expect(alerts.notification).toBeNull();
  await Renderer.act(async () => tree.update(<Probe />));
  expect(alerts.notification).toBeNull();
});
test('dismissal and delivery deduplication still allow the next move in the same room', async () => {
  await mount(); await deliver();
  await Renderer.act(async () => alerts.dismiss());
  await deliver(); expect(alerts.notification).toBeNull();
  await deliver(notification('abcdef12', 'two'));
  expect(alerts.notification?.deliveryId).toBe('two');
});
test('a newer notification replaces the banner without mixing room IDs', async () => {
  await mount(); await deliver(); await deliver(notification('11223344', 'two'));
  expect(alerts.notification?.gameId).toBe('11223344');
});
test('background and inactive apps leave notification display to the OS', async () => {
  await mount(); await deliver();
  AppState.currentState = 'background';
  await Renderer.act(async () => stateChanged('background'));
  expect(alerts.notification).toBeNull();
  await deliver(notification('11223344', 'two'));
  expect(alerts.notification).toBeNull();
  AppState.currentState = 'inactive'; await deliver(notification('11223344', 'three'));
  expect(alerts.notification).toBeNull();
});
test('listeners are removed on unmount', async () => {
  await mount(); await Renderer.act(() => tree.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1);
});
