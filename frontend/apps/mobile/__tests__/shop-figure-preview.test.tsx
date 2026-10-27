import React from 'react';
import { Image, StyleSheet } from 'react-native';
import Renderer from 'react-test-renderer';
import type { RiveFile } from '@rive-app/react-native';
import { FIGURES, type ShopFigure } from '@rps/core/shop';
import { ShopFigurePreview } from '../src/components/shop-figure-preview';
import { cacheFigureAnimation } from '../src/figures/asset-cache';
import { bundledHashes } from '../src/figures/remote-animation';
import type { DisplayFigure } from '../src/figures/catalog';

jest.mock('../src/figures/asset-cache');
// Spy on the actual CommonJS mock exports, not Babel's wildcard copy.
const Rive: typeof import('@rive-app/react-native') = require('@rive-app/react-native');
const figure: ShopFigure = { ...FIGURES[1], imageUrl: 'https://example.test/fig2.png', available: true, priceLamports: '1000000' };
const definition: DisplayFigure = { ...FIGURES[1], imageUrl: figure.imageUrl,
  animation: { contract: 1, sha256: bundledHashes[2], bytes: 500, url: 'https://example.test/fig2.riv' } };
const file = { model: 'fig2' } as unknown as RiveFile;
const view = { play: jest.fn(), setNumberInputValue: jest.fn(), triggerInput: jest.fn(), reset: jest.fn(), pause: jest.fn() };
const hybridCallback = () => undefined;
let tree: Renderer.ReactTestRenderer;
let reportedView: typeof view;

beforeEach(() => {
  jest.clearAllMocks();
  reportedView = view;
  view.play.mockResolvedValue(undefined);
  view.setNumberInputValue.mockReset();
  jest.spyOn(Rive, 'useRive').mockImplementation(() => ({ riveViewRef: reportedView, setHybridRef: { f: hybridCallback } }) as never);
  jest.spyOn(Rive, 'useRiveFile').mockReturnValue({ riveFile: file, isLoading: false, error: null });
  jest.mocked(cacheFigureAnimation).mockResolvedValue('file:///verified-future.riv');
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); });
async function mount(active = true, nextFigure = figure, nextDefinition = definition) {
  await Renderer.act(async () => { tree = Renderer.create(<ShopFigurePreview figure={nextFigure} definition={nextDefinition} active={active} />); });
}
function portrait() { return tree.root.findAllByType(Image).find(image => image.props.testID === 'shop-preview-portrait')!; }

test('shows the real portrait without loading a Rive while inactive', async () => {
  await mount(false);
  expect(portrait().props.source).toEqual({ uri: figure.imageUrl });
  expect(Rive.useRiveFile).not.toHaveBeenCalled();
  expect(cacheFigureAnimation).not.toHaveBeenCalled();
  const frame = tree.root.findByProps({ testID: 'shop-preview-fig2' });
  expect(frame.props.accessibilityLabel).toBe('Seeker fighter preview');
  expect(frame.props.pointerEvents).toBe('none');
  expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ width: 300, height: 300, bottom: 24 });
});

test.each([false, true])('Front No Weapon is applied before and after playback, with portrait until ready (Android cold start: %s)', async cold => {
  let finish!: () => void;
  view.play.mockImplementationOnce(() => new Promise<void>(done => { finish = done; }));
  await mount();
  const rive = tree.root.findByType(Rive.RiveView);
  expect(rive.props.stateMachineName).toBe('State Machine Front');
  expect(rive.props.autoPlay).toBe(false);
  expect(rive.props.fit).toBe(Rive.Fit.Contain);
  expect(view.setNumberInputValue.mock.calls).toEqual([['Weapon', 0]]);
  expect(StyleSheet.flatten(portrait().props.style).opacity).not.toBe(0);
  expect(view.setNumberInputValue.mock.invocationCallOrder[0]).toBeLessThan(view.play.mock.invocationCallOrder[0]);
  if (cold) view.setNumberInputValue.mockClear();
  await Renderer.act(async () => finish());
  expect(view.setNumberInputValue.mock.calls).toEqual(cold ? [['Weapon', 0]] : [['Weapon', 0], ['Weapon', 0]]);
  expect(StyleSheet.flatten(portrait().props.style).opacity).toBe(0);
  expect(view.triggerInput).not.toHaveBeenCalled();
  expect(view.reset).not.toHaveBeenCalled();
});

test.each(['file', 'input', 'play', 'native'] as const)('%s failure leaves an accessible portrait, not a blank or armed default pose', async failure => {
  if (failure === 'file') jest.mocked(Rive.useRiveFile).mockReturnValue({ riveFile: null, isLoading: false, error: new Error('Unavailable') });
  if (failure === 'input') view.setNumberInputValue.mockImplementationOnce(() => { throw new Error('Unavailable'); });
  if (failure === 'play') view.play.mockRejectedValueOnce(new Error('Unavailable'));
  await mount();
  if (failure === 'native') await Renderer.act(() => tree.root.findByType(Rive.RiveView).props.onError({ message: 'Unavailable' }));
  expect(StyleSheet.flatten(portrait().props.style).opacity).not.toBe(0);
  expect(tree.root.findAllByType(Rive.RiveView)).toHaveLength(0);
  expect(tree.root.findByProps({ testID: 'shop-preview-fig2' }).props.accessibilityRole).toBe('image');
});

test('a price/quantity rerender and a second wrapper for the same native view never reset or restart idle', async () => {
  await mount();
  const instance = tree.root.findByType(Rive.RiveView);
  reportedView = { ...view, equals: () => true } as typeof view;
  await Renderer.act(() => tree.update(<ShopFigurePreview figure={{ ...figure, priceLamports: '2000000' }} definition={{ ...definition }} active />));
  expect(tree.root.findByType(Rive.RiveView)).toBe(instance);
  expect(view.play).toHaveBeenCalledTimes(1);
  expect(view.setNumberInputValue).toHaveBeenCalledTimes(2);
  expect(view.pause).not.toHaveBeenCalled();
  expect(view.reset).not.toHaveBeenCalled();
});

test('deactivation removes the native view and restores the portrait immediately, including pending initialization', async () => {
  let finish!: () => void;
  view.play.mockImplementationOnce(() => new Promise<void>(done => { finish = done; }));
  await mount();
  await Renderer.act(() => tree.update(<ShopFigurePreview figure={figure} definition={definition} active={false} />));
  await Renderer.act(async () => finish());
  expect(tree.root.findAllByType(Rive.RiveView)).toHaveLength(0);
  expect(StyleSheet.flatten(portrait().props.style).opacity).not.toBe(0);
  expect(view.setNumberInputValue).toHaveBeenCalledTimes(1);
});

test('future models and a changed bundled digest use the existing verified cache, never a fallback fighter', async () => {
  const future = { ...figure, id: 'future', name: 'Future', variant: 42 };
  const futureDefinition = { ...definition, id: future.id, variant: 42, animation: { ...definition.animation!, sha256: 'a'.repeat(64) } };
  await mount(true, future, futureDefinition);
  expect(cacheFigureAnimation).toHaveBeenCalledWith(futureDefinition.animation);
  expect(Rive.useRiveFile).toHaveBeenCalledWith({ uri: 'file:///verified-future.riv' });
  expect(tree.root.findByType(Rive.RiveView).props.file).toBe(file);
  expect(Rive.useRiveFile).not.toHaveBeenCalledWith(expect.any(Number));
  await Renderer.act(async () => { tree.update(<ShopFigurePreview figure={figure}
    definition={{ ...definition, animation: { ...definition.animation!, sha256: 'b'.repeat(64) } }} active />); });
  expect(cacheFigureAnimation).toHaveBeenLastCalledWith(expect.objectContaining({ sha256: 'b'.repeat(64) }));
  expect(Rive.useRiveFile).not.toHaveBeenCalledWith(expect.any(Number));
});

test('unknown figures without a matching descriptor keep their own portrait', async () => {
  await mount(true, { ...figure, id: 'unknown', variant: 42 }, definition);
  expect(tree.root.findAllByType(Rive.RiveView)).toHaveLength(0);
  expect(Rive.useRiveFile).not.toHaveBeenCalled();
  expect(cacheFigureAnimation).not.toHaveBeenCalled();
  expect(portrait().props.source).toEqual({ uri: figure.imageUrl });
});

test('offline/hash-verification failure keeps the portrait through bounded retries, then stops loading', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(cacheFigureAnimation).mockRejectedValue(new Error('Model verification failed'));
    const remote = { ...figure, id: 'future', variant: 42 };
    const descriptor = { ...definition, id: remote.id, variant: 42, animation: { ...definition.animation!, sha256: 'a'.repeat(64) } };
    await mount(true, remote, descriptor);
    for (const delay of [3000, 6000]) await Renderer.act(async () => { jest.advanceTimersByTime(delay); });
    expect(cacheFigureAnimation).toHaveBeenCalledTimes(3);
    expect(tree.root.findAllByType(Rive.RiveView)).toHaveLength(0);
    expect(StyleSheet.flatten(portrait().props.style).opacity).not.toBe(0);
    await Renderer.act(async () => { jest.advanceTimersByTime(60000); });
    expect(cacheFigureAnimation).toHaveBeenCalledTimes(3);
    await Renderer.act(() => tree.unmount());
  } finally { jest.useRealTimers(); }
});
