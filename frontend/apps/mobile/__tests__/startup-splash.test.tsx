import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StartupSplash } from '../src/components/startup-splash';
import { homeArt } from '../src/components/toy-home-controls';

// Spy on the actual CommonJS exports (not TypeScript's wrapped namespace).
const native = jest.requireActual('react-native');
let tree: Renderer.ReactTestRenderer;
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  jest.restoreAllMocks();
});

test.each([
  [320, 568, 20, 0, 1],
  [390, 844, 59, 34, 1],
  [768, 1024, 24, 20, 1.8],
  [844, 390, 0, 21, 1],
])('keeps logo proportional and loading clear of safe areas at %sx%s', async (width, height, top, bottom, fontScale) => {
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height, scale: 3, fontScale });
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top, bottom, left: 0, right: 0 });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  const images = tree.root.findAllByType(Image);
  const background = images.find(image => image.props.accessible === false)!;
  expect(background.props.source).toBe(require('../src/assets/ui/splash-playground-v1.png'));
  expect(background.props.resizeMode).toBe('cover');
  expect(background.props.accessibilityElementsHidden).toBe(true);
  const logo = images.find(image => image.props.accessibilityLabel === 'RIPSY')!;
  expect(logo.props.source).toBe(homeArt.logo);
  const style = StyleSheet.flatten(logo.props.style);
  expect(style.width).toBeLessThanOrEqual(Math.min(width * 0.78, 440, height * 0.7));
  expect(style.width / style.height).toBe(2.5);
  expect(style.top).toBeGreaterThanOrEqual(top + 16);
  const loading = tree.root.findByType(ActivityIndicator);
  expect(StyleSheet.flatten(loading.parent!.props.style).bottom).toBe(bottom + 32);
  expect(loading.props.accessibilityRole).toBe('progressbar');
  expect(tree.root.findByType(Text).props.children).toBe('Opening the toy box…');
});

test('waits for both local images to settle, including failures, exactly once', async () => {
  const ready = jest.fn();
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash onArtworkReady={ready} />); });
  const images = tree.root.findAllByType(Image);
  await Renderer.act(() => images[0].props.onLoadEnd());
  expect(ready).not.toHaveBeenCalled();
  await Renderer.act(() => images[0].props.onLoadEnd());
  expect(ready).not.toHaveBeenCalled();
  await Renderer.act(() => images[1].props.onLoadEnd());
  expect(ready).toHaveBeenCalledTimes(1);
  await Renderer.act(() => images[1].props.onLoadEnd());
  expect(ready).toHaveBeenCalledTimes(1);
});

test('a missing native image callback cannot hold startup indefinitely', async () => {
  jest.useFakeTimers();
  try {
    const ready = jest.fn();
    await Renderer.act(async () => { tree = Renderer.create(<StartupSplash onArtworkReady={ready} />); });
    await Renderer.act(() => jest.advanceTimersByTime(1499));
    expect(ready).not.toHaveBeenCalled();
    await Renderer.act(() => jest.advanceTimersByTime(1));
    expect(ready).toHaveBeenCalledTimes(1);
    await Renderer.act(() => tree.root.findAllByType(Image).forEach(image => image.props.onLoadEnd()));
    expect(ready).toHaveBeenCalledTimes(1);
  } finally {
    await Renderer.act(() => tree.unmount());
    jest.useRealTimers();
  }
});
