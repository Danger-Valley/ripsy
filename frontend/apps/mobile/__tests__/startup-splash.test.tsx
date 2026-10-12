import React from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StartupSplash } from '../src/components/startup-splash';
import { homeArt } from '../src/components/toy-home-controls';

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
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ width: 887, height: 1774, scale: 1, uri: 'splash.png' });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  const background = tree.root.findAllByType(Image).find(image => image.props.accessible === false)!;
  const imageView = StyleSheet.flatten(background.props.style);
  expect(background.props.resizeMode).toBe('cover');
  expect(imageView).toEqual({ position: 'absolute', left: 0, top: 0, width, height });
  // Both explicit dimensions override RN's default 887x1774 asset bounds.
  expect(StyleSheet.flatten([{ width: 887, height: 1774 }, background.props.style])).toEqual(imageView);
  const logo = tree.root.findAllByType(Image).find(image => image.props.accessibilityLabel === 'RIPSY')!;
  const brand = StyleSheet.flatten(logo.props.style);
  expect(logo.props.resizeMode).toBe('contain');
  expect(brand.width / brand.height).toBe(2.5);
  expect(brand.left).toBeCloseTo((width - brand.width) / 2);
  expect(brand.left + brand.width).toBeLessThanOrEqual(width);
  expect(brand.top).toBeGreaterThanOrEqual(top + 16);
  expect(brand.top + brand.height).toBeLessThanOrEqual(height * 0.5);
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'startup-loading' }).props.style).bottom).toBe(bottom + 32);
});

test('Android uses measured root bounds, not source pixels or cached window dimensions', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width: 412, height: 915, scale: 3, fontScale: 1 });
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 24, bottom: 24, left: 20, right: 16 });
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ width: 1200, height: 1800, scale: 1, uri: 'replacement.png' });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  await Renderer.act(() => tree.root.findByProps({ testID: 'startup-splash' }).props.onLayout({
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 720 } },
  }));
  const frame = StyleSheet.flatten(tree.root.findAllByType(Image)[0].props.style);
  expect(frame).toEqual({ position: 'absolute', left: 0, top: 0, width: 360, height: 720 });
  const brand = StyleSheet.flatten(tree.root.findAllByType(Image)[1].props.style);
  expect(brand.width).toBeCloseTo(360 * 0.78);
  expect(brand.top).toBeCloseTo(720 * 0.25 - brand.height / 2);
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
])('keeps logo proportional and loading clear of safe areas at %sx%s', async (width, height, top, bottom, fontScale) => {
  jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height, scale: 3, fontScale });
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top, bottom, left: 0, right: 0 });
  await Renderer.act(async () => { tree = Renderer.create(<StartupSplash />); });
  const images = tree.root.findAllByType(Image);
  const background = images.find(image => image.props.accessible === false)!;
  expect(background.props.source).toBe(require('../src/assets/ui/splash-playground-v1.png'));
  expect(background.props.resizeMode).toBe('cover');
  expect(StyleSheet.flatten(background.props.style)).toEqual({ position: 'absolute', left: 0, top: 0, width, height });
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
    const source = { uri: 'asset:///splash.png', width: 887, height: 1774 };
    const imageHost = () => imageTree.root.findAll(node => typeof node.type === 'string' && Array.isArray(node.props.source) && node.props.source[0]?.uri === source.uri)[0];
    await Renderer.act(async () => { imageTree = Renderer.create(<NativeImage {...props} source={source} style={StyleSheet.absoluteFill} />); });
    const oldBounds = StyleSheet.flatten(imageHost().props.style);
    expect(oldBounds.width).toBe(887); expect(oldBounds.height).toBe(1774);
    await Renderer.act(() => imageTree.update(<NativeImage {...props} source={source} />));
    const host = imageHost();
    expect(host).toBeDefined();
    const frame = StyleSheet.flatten(host.props.style);
    expect(frame.width).toBe(360); expect(frame.height).toBe(800);
    expect(host.props.resizeMode).toBe('cover');
  } finally { if (imageTree) await Renderer.act(() => imageTree.unmount()); }
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
