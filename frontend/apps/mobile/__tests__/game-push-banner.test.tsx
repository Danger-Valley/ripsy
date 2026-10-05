import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import Renderer from 'react-test-renderer';
import { GamePushBanner, GamePushBannerContext } from '../src/components/game-push-banner';
import { ToyDialog } from '../src/components/toy-dialog';

const notification = { gameId: 'abcdef12', title: 'Your turn', body: 'Your opponent moved.' };
let tree: Renderer.ReactTestRenderer;
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); });

test('does not render an invisible placeholder when there is no alert', async () => {
  await Renderer.act(async () => { tree = Renderer.create(<GamePushBanner notification={null} onOpen={jest.fn()} onDismiss={jest.fn()} />); });
  expect(tree.toJSON()).toBeNull();
});
test('opens the exact room and exposes an independent accessible dismiss action', async () => {
  const onOpen = jest.fn(); const onDismiss = jest.fn();
  await Renderer.act(async () => { tree = Renderer.create(<GamePushBanner notification={notification} onOpen={onOpen} onDismiss={onDismiss} />); });
  const open = tree.root.find(node => node.props.accessibilityHint === 'Open this battle' && typeof node.props.onPress === 'function');
  const dismiss = tree.root.find(node => node.props.accessibilityLabel === 'Dismiss battle notification' && typeof node.props.onPress === 'function');
  await Renderer.act(async () => { open!.props.onPress(); dismiss!.props.onPress(); });
  expect(onOpen).toHaveBeenCalledWith('abcdef12'); expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(open!.props.accessibilityLabel).toContain('Battle ABCDEF12');
  expect(dismiss!.props.accessibilityLabel).toBe('Dismiss battle notification');
  expect(StyleSheet.flatten(dismiss!.props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(44);
});
test('the native Settings dialog has its own alert host and closes before opening the game', async () => {
  const onOpen = jest.fn(); const onClose = jest.fn();
  await Renderer.act(async () => { tree = Renderer.create(
    <GamePushBannerContext.Provider value={{ notification, onOpen, onDismiss: jest.fn() }}>
      <ToyDialog visible title="Settings" onClose={onClose} />
    </GamePushBannerContext.Provider>,
  ); });
  const open = tree.root.find(node => node.props.accessibilityHint === 'Open this battle' && typeof node.props.onPress === 'function');
  await Renderer.act(async () => open.props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1); expect(onOpen).toHaveBeenCalledWith('abcdef12');
  expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onOpen.mock.invocationCallOrder[0]!);
});
test('a dialog in a previous game does not obscure navigation to a different room', async () => {
  const listeners: Record<string, () => void> = {};
  const navigation = { isFocused: () => true, addListener: (name: string, listener: () => void) => { listeners[name] = listener; return jest.fn(); } } as unknown as React.ContextType<typeof NavigationContext>;
  await Renderer.act(async () => { tree = Renderer.create(<NavigationContext.Provider value={navigation}><ToyDialog visible title="Choose weapon" /></NavigationContext.Provider>); });
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  await Renderer.act(async () => listeners.blur!());
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  await Renderer.act(async () => listeners.focus!());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
});
