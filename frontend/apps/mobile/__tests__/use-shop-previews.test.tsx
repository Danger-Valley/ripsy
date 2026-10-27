import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Renderer from 'react-test-renderer';
import { useShopPreviewMotion, useShopPreviewViewport } from '../src/hooks/use-shop-previews';

const navigationListeners: Record<string, () => void> = {};
const unsubscribe = jest.fn();
const navigation = { isFocused: () => true, addListener(event: string, listener: () => void) { navigationListeners[event] = listener; return unsubscribe; } };
let motion = false;
let viewport: ReturnType<typeof useShopPreviewViewport>;
let onAppState: (state: AppStateStatus) => void;
let onReduceMotion: (value: boolean) => void;
let tree: Renderer.ReactTestRenderer;
const originalAppState = AppState.currentState;
const appSubscription = { remove: jest.fn() }, motionSubscription = { remove: jest.fn() };
function Probe() { motion = useShopPreviewMotion(navigation); viewport = useShopPreviewViewport(); return null; }
const layout = (y: number, height: number) => ({ nativeEvent: { layout: { y, height } } }) as LayoutChangeEvent;
const scroll = (y: number) => ({ nativeEvent: { contentOffset: { y } } }) as NativeSyntheticEvent<NativeScrollEvent>;
async function mount() { await Renderer.act(async () => { tree = Renderer.create(<Probe />); }); }

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, listener) => { onAppState = listener; return appSubscription; });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_name, listener) => { onReduceMotion = listener as (value: boolean) => void; return motionSubscription; });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); AppState.currentState = originalAppState; });

test('animations follow focus, foreground and live Reduce Motion changes and release every subscription', async () => {
  await mount(); expect(motion).toBe(true);
  await Renderer.act(() => navigationListeners.blur()); expect(motion).toBe(false);
  await Renderer.act(() => navigationListeners.focus()); expect(motion).toBe(true);
  await Renderer.act(() => onAppState('background')); expect(motion).toBe(false);
  await Renderer.act(() => onAppState('active')); expect(motion).toBe(true);
  await Renderer.act(() => onReduceMotion(true)); expect(motion).toBe(false);
  await Renderer.act(() => onReduceMotion(false)); expect(motion).toBe(true);
  await Renderer.act(() => tree.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  expect(appSubscription.remove).toHaveBeenCalledTimes(1);
  expect(motionSubscription.remove).toHaveBeenCalledTimes(1);
});

test('an unresolved or failed OS preference keeps a static portrait; a stale query cannot undo a newer change', async () => {
  let finish!: (value: boolean) => void;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await mount(); expect(motion).toBe(false);
  await Renderer.act(() => onReduceMotion(true));
  await Renderer.act(async () => finish(false)); expect(motion).toBe(false);
  await Renderer.act(() => tree.unmount());
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValueOnce(new Error('Unavailable'));
  await mount(); expect(motion).toBe(false);
});

test('only visible showcases animate, not offscreen cards or their purchase controls; no per-frame state changes', async () => {
  await mount(); expect(viewport.visibleIds).toEqual([]);
  await Renderer.act(() => {
    viewport.onCardLayout('fig2', layout(200, 500), 248);
    viewport.onCardLayout('bonk', layout(720, 500), 248);
    viewport.onViewportLayout(layout(0, 600));
  });
  expect(viewport.visibleIds).toEqual(['fig2']);
  const previous = viewport.visibleIds;
  await Renderer.act(() => viewport.onScroll(scroll(10)));
  expect(viewport.visibleIds).toBe(previous);
  await Renderer.act(() => viewport.onScroll(scroll(450)));
  expect(viewport.visibleIds).toEqual(['bonk']);
  await Renderer.act(() => viewport.onScroll(scroll(970)));
  expect(viewport.visibleIds).toEqual([]);
  await Renderer.act(() => viewport.onScroll(scroll(0)));
  expect(viewport.visibleIds).toEqual(['fig2']);
  // Reflow when a pack/account notice above the cards changes height.
  await Renderer.act(() => viewport.onCardLayout('fig2', layout(800, 500), 248));
  expect(viewport.visibleIds).toEqual([]);
});
