import React from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StartupSplash } from '../src/components/startup-splash';

// Spy on the actual CommonJS exports (not TypeScript's wrapped namespace).
const native = jest.requireActual('react-native');
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  jest.restoreAllMocks();
});

test.each([
  [360, 800, 24, 24, 1],
  [412, 915, 32, 24, 1],
  [360, 960, 40, 48, 1.6],
  [800, 360, 24, 24, 1],
  [800, 1280, 24, 24, 1.8],
])('Android aspect-fills an explicitly viewport-sized image at %sx%s', async (width, height, top, bottom, fontScale) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height, scale: 3, fontScale });
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top, bottom, left: 0, right: 0 });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  const background = tree.root.findByType(Image);
  const imageView = StyleSheet.flatten(background.props.style);
  expect(background.props.resizeMode).toBe('cover');
  expect(imageView).toEqual({ position: 'absolute', left: 0, top: 0, width, height });
  // Both explicit dimensions override RN's default 945x2048 asset bounds.
  expect(StyleSheet.flatten([{ width: 945, height: 2048 }, background.props.style])).toEqual(imageView);
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'startup-loading' }).props.style).bottom).toBe(bottom + 32);
});

test('Android uses measured root bounds, not source pixels or cached window dimensions', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width: 412, height: 915, scale: 3, fontScale: 1 });
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 24, bottom: 24, left: 20, right: 16 });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  await Renderer.act(() => tree.root.findByProps({ testID: 'startup-splash' }).props.onLayout({
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 720 } },
  }));
  const frame = StyleSheet.flatten(tree.root.findAllByType(Image)[0].props.style);
  expect(frame).toEqual({ position: 'absolute', left: 0, top: 0, width: 360, height: 720 });
  await Renderer.act(() => tree.root.findByProps({ testID: 'startup-splash' }).props.onLayout({
    nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0 } },
  }));
  expect(StyleSheet.flatten(tree.root.findAllByType(Image)[0].props.style)).toEqual(frame);
  // A larger caption must never shrink the background to make loading space.
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width: 412, height: 915, scale: 3, fontScale: 2 });
  await Renderer.act(() => tree.update(<StartupSplash />));
  expect(StyleSheet.flatten(tree.root.findAllByType(Image)[0].props.style)).toEqual(frame);
  expect(tree.root.findByProps({ testID: 'startup-loading' }).props.onLayout).toBeUndefined();
  await Renderer.act(() => tree.root.findByProps({ testID: 'startup-splash' }).props.onLayout({ nativeEvent: { layout: { width: 720, height: 360 } } }));
  expect(StyleSheet.flatten(tree.root.findAllByType(Image)[0].props.style)).toEqual({ position: 'absolute', left: 0, top: 0, width: 720, height: 360 });
});

test.each([
  [320, 568, 20, 0, 1],
  [390, 844, 59, 34, 1],
  [768, 1024, 24, 20, 1.8],
  [844, 390, 0, 21, 1],
])('shows the branded asset once with safe-area loading at %sx%s', async (width, height, top, bottom, fontScale) => {
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height, scale: 3, fontScale });
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top, bottom, left: 0, right: 0 });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  const images = tree.root.findAllByType(Image);
  // The replacement already contains its logo; another image would duplicate it.
  expect(images).toHaveLength(1);
  const background = images[0];
  expect(background.props.source).toBe(require('../src/assets/ui/splashscreen.png'));
  expect(background.props.resizeMode).toBe('cover');
  expect(StyleSheet.flatten(background.props.style)).toEqual({ position: 'absolute', left: 0, top: 0, width, height });
  expect(background.props.accessibilityLabel).toBe('RIPSY');
  expect(background.props.accessible).toBe(true);
  const loading = tree.root.findByType(ActivityIndicator);
  expect(StyleSheet.flatten(loading.parent!.props.style).bottom).toBe(bottom + 32);
  expect(loading.props.accessibilityRole).toBe('progressbar');
  expect(tree.root.findByType(Text).props.children).toBe('Opening the toy box…');
});

test.each(['android', 'ios'] as const)('real %s Image wrapper cannot retain oversized intrinsic splash bounds', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width: 360, height: 800, scale: 3, fontScale: 1 });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  const props = tree.root.findAllByType(Image)[0].props;
  // Exercise RN's real wrapper, not the preset Image mock which skipped its
  // intrinsic-size prefix and allowed the previous regression to pass.
  const NativeImage = jest.requireActual(`react-native/Libraries/Image/Image.${os}`).default;
  let imageTree!: Renderer.ReactTestRenderer;
  try {
    const source = { uri: 'asset:///splash.png', width: 945, height: 2048 };
    const imageHost = () => imageTree.root.findAll(node => typeof node.type === 'string' && Array.isArray(node.props.source) && node.props.source[0]?.uri === source.uri)[0];
    await Renderer.act(async () => { imageTree = Renderer.create(<NativeImage {...props} source={source} style={StyleSheet.absoluteFill} />); });
    const oldBounds = StyleSheet.flatten(imageHost().props.style);
    expect(oldBounds.width).toBe(945); expect(oldBounds.height).toBe(2048);
    await Renderer.act(() => imageTree.update(<NativeImage {...props} source={source} />));
    const host = imageHost();
    expect(host).toBeDefined();
    const frame = StyleSheet.flatten(host.props.style);
    expect(frame.width).toBe(360); expect(frame.height).toBe(800);
    expect(host.props.resizeMode).toBe('cover');
  } finally { if (imageTree) await Renderer.act(() => imageTree.unmount()); }
});

test('finishes when the single artwork settles, including failures, exactly once', async () => {
  const ready = jest.fn();
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash onArtworkReady={ready} />); });
  expect(ready).not.toHaveBeenCalled();
  const artwork = tree.root.findByType(Image);
  await Renderer.act(() => artwork.props.onLoadEnd());
  expect(ready).toHaveBeenCalledTimes(1);
  await Renderer.act(() => artwork.props.onLoadEnd());
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
