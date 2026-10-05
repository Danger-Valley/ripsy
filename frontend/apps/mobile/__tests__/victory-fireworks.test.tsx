import React from 'react';
import { NavigationContext } from '@react-navigation/native';
import { Animated, AppState, StyleSheet, type AppStateStatus } from 'react-native';
import Renderer from 'react-test-renderer';
import { VictoryFireworks } from '../src/components/victory-fireworks';

let tree: Renderer.ReactTestRenderer;
let onAppState: (state: AppStateStatus) => void;
let finish: ((result: { finished: boolean }) => void) | undefined;
const start = jest.fn(callback => { finish = callback; });
const stop = jest.fn();
const remove = jest.fn();
const originalAppState = AppState.currentState;

beforeEach(() => {
  jest.clearAllMocks();
  finish = undefined;
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, listener) => {
    onAppState = listener;
    return { remove };
  });
  jest.spyOn(Animated, 'timing');
  jest.spyOn(Animated, 'parallel').mockImplementation(() => ({ start, stop, reset: jest.fn() }));
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
});
async function mount(victoryId: string | null = 'room:alice', reduceMotionEnabled: boolean | null = false) {
  await Renderer.act(() => { tree = Renderer.create(<VictoryFireworks victoryId={victoryId} reduceMotionEnabled={reduceMotionEnabled} />); });
}
async function measure(width = 375, height = 700) {
  await Renderer.act(() => tree.root.findByProps({ testID: 'victory-fireworks-layer' }).props.onLayout({ nativeEvent: { layout: { width, height } } }));
}

test('three native-driven bursts are decorative and do not intercept buttons or accessibility', async () => {
  await mount();
  expect(start).not.toHaveBeenCalled();
  await measure();
  const layer = tree.root.findByProps({ testID: 'victory-fireworks-layer' });
  expect(layer.props.pointerEvents).toBe('none');
  expect(layer.props.accessibilityElementsHidden).toBe(true);
  expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(StyleSheet.flatten(layer.props.style).position).toBe('absolute');
  expect(tree.root.findAllByType(Animated.View).filter(node => node.props.testID === 'victory-firework-rocket')).toHaveLength(3);
  expect(tree.root.findAllByType(Animated.View).filter(node => node.props.testID === 'victory-firework-spark')).toHaveLength(36);
  const bursts = jest.mocked(Animated.timing).mock.calls.filter(([, config]) => config.toValue === 1);
  expect(bursts).toHaveLength(3);
  expect(bursts.every(([, config]) => config.useNativeDriver && config.duration === 1100)).toBe(true);
  expect(start).toHaveBeenCalledTimes(1);
});

test('finished celebration disappears and ordinary rerenders never replay the win', async () => {
  await mount(); await measure();
  await Renderer.act(() => finish?.({ finished: true }));
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={false} />));
  expect(start).toHaveBeenCalledTimes(1);
});

test('unknown motion preference waits, while reduced motion suppresses the celebration permanently', async () => {
  await mount('room:alice', null);
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={true} />));
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={false} />));
  expect(start).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
});

test('resolved motion preference starts a pending win only after it is allowed and measured', async () => {
  await mount('room:alice', null);
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={false} />));
  expect(start).not.toHaveBeenCalled();
  await measure();
  expect(start).toHaveBeenCalledTimes(1);
});

test('enabling reduced motion during fireworks stops and removes them without replay', async () => {
  await mount(); await measure();
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={true} />));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={false} />));
  expect(start).toHaveBeenCalledTimes(1);
});

test('backgrounding stops fireworks and returning does not restart them', async () => {
  await mount(); await measure();
  await Renderer.act(() => onAppState('background'));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
  await Renderer.act(() => onAppState('active'));
  expect(start).toHaveBeenCalledTimes(1);
});

test('offscreen or background wins do not queue a celebration for later', async () => {
  AppState.currentState = 'background';
  await mount();
  await Renderer.act(() => onAppState('active'));
  expect(start).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
});

test('screen blur stops fireworks and focus does not replay them', async () => {
  const listeners: Record<string, () => void> = {};
  const unsubscribe = jest.fn();
  const navigation = {
    isFocused: () => true,
    addListener: (name: string, callback: () => void) => { listeners[name] = callback; return unsubscribe; },
  };
  await Renderer.act(() => {
    tree = Renderer.create(<NavigationContext.Provider value={navigation as never}>
      <VictoryFireworks victoryId="room:alice" reduceMotionEnabled={false} />
    </NavigationContext.Provider>);
  });
  await measure();
  await Renderer.act(() => listeners.blur!());
  expect(stop).toHaveBeenCalledTimes(1);
  await Renderer.act(() => listeners.focus!());
  expect(start).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
  await Renderer.act(() => tree.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(1);
});

test.each([320, 375, 768, 1280])('lays out one bounded celebration at %i points without restarting on resize', async width => {
  await mount(); await measure(width);
  expect(tree.root.findAllByType(Animated.View).filter(node => node.props.testID === 'victory-firework-spark')).toHaveLength(36);
  await measure(width + 10);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
});

test('no victory leaves no overlay and unmount stops pending native animation', async () => {
  await mount(null);
  expect(start).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ testID: 'victory-fireworks-layer' })).toHaveLength(0);
  await Renderer.act(() => tree.update(<VictoryFireworks victoryId="room:alice" reduceMotionEnabled={false} />));
  await measure();
  await Renderer.act(() => tree.unmount());
  expect(stop).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  await Renderer.act(() => finish?.({ finished: false }));
});
