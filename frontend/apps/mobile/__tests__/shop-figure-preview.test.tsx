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
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  jest.clearAllMocks();
  reportedView = view;
  view.play.mockResolvedValue(undefined);
  view.setNumberInputValue.mockReset();
  view.triggerInput.mockReset();
  jest.spyOn(Rive, 'useRive').mockImplementation(() => ({ riveViewRef: reportedView, setHybridRef: { f: hybridCallback } }) as never);
  jest.spyOn(Rive, 'useRiveFile').mockReturnValue({ riveFile: file, isLoading: false, error: null });
  jest.mocked(cacheFigureAnimation).mockResolvedValue('file:///verified-future.riv');
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
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

test('hops on the same unarmed Front machine after readiness, with fresh bounded jitter each time', async () => {
  jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(0.8);
  const timeout = jest.spyOn(global, 'setTimeout');
  await mount();
  const instance = tree.root.findByType(Rive.RiveView);
  const delay = () => timeout.mock.calls.at(-1)![1] as number;
  const firstDelay = delay();
  expect(firstDelay).toBeGreaterThanOrEqual(3000); expect(firstDelay).toBeLessThan(7000);
  await Renderer.act(async () => { jest.advanceTimersByTime(firstDelay - 1); });
  expect(view.triggerInput).not.toHaveBeenCalled();
  await Renderer.act(async () => { jest.advanceTimersByTime(1); });
  expect(view.triggerInput.mock.calls).toEqual([['Jump Forward']]);
  const secondDelay = delay();
  expect(secondDelay).toBeGreaterThan(firstDelay); expect(secondDelay).toBeLessThan(7000);
  await Renderer.act(async () => { jest.advanceTimersByTime(secondDelay); });
  expect(view.triggerInput.mock.calls).toEqual([['Jump Forward'], ['Jump Forward']]);
  expect(tree.root.findByType(Rive.RiveView)).toBe(instance);
  expect(view.play).toHaveBeenCalledTimes(1);
  expect(view.setNumberInputValue.mock.calls).toEqual([['Weapon', 0], ['Weapon', 0]]);
  expect(view.reset).not.toHaveBeenCalled(); expect(view.pause).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(instance.props.style)).toMatchObject({ top: -75, bottom: -75, left: 0, right: 0 });
});

test('models keep distinct phases even with identical jitter, not a shared simultaneous interval', async () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const timeout = jest.spyOn(global, 'setTimeout');
  await Renderer.act(async () => { tree = Renderer.create(<>
    {['fig2', 'bonk', 'jup', 'ore'].map((id, index) => <ShopFigurePreview key={id}
      figure={{ ...figure, id, variant: index + 2 }} active />)}
  </>); });
  const delays = timeout.mock.calls.map(call => call[1] as number);
  expect(delays).toHaveLength(4);
  expect(new Set(delays).size).toBe(4);
  for (const delay of delays) { expect(delay).toBeGreaterThanOrEqual(3000); expect(delay).toBeLessThan(7000); }
  await Renderer.act(async () => { jest.advanceTimersByTime(Math.min(...delays)); });
  expect(view.triggerInput).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(Rive.RiveView)).toHaveLength(4);
});

test('price/quantity updates and equivalent native wrappers preserve the original hop deadline', async () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const timeout = jest.spyOn(global, 'setTimeout');
  await mount();
  const delay = timeout.mock.calls.at(-1)![1] as number;
  await Renderer.act(async () => { jest.advanceTimersByTime(delay - 100); });
  reportedView = { ...view, equals: () => true } as typeof view;
  await Renderer.act(() => tree.update(<ShopFigurePreview figure={{ ...figure, priceLamports: '2000000' }} definition={{ ...definition }} active />));
  expect(jest.getTimerCount()).toBe(1);
  await Renderer.act(async () => { jest.advanceTimersByTime(100); });
  expect(view.triggerInput).toHaveBeenCalledTimes(1); expect(view.play).toHaveBeenCalledTimes(1);
});

test('no hop timer starts during loading, and deactivation/unmount or native failure cancels it', async () => {
  let finish!: () => void;
  view.play.mockImplementationOnce(() => new Promise<void>(done => { finish = done; }));
  await mount();
  expect(jest.getTimerCount()).toBe(0);
  await Renderer.act(async () => { jest.advanceTimersByTime(20000); });
  expect(view.triggerInput).not.toHaveBeenCalled();
  await Renderer.act(async () => finish());
  expect(jest.getTimerCount()).toBe(1);
  await Renderer.act(() => tree.update(<ShopFigurePreview figure={figure} definition={definition} active={false} />));
  expect(jest.getTimerCount()).toBe(0);
  await Renderer.act(async () => { jest.advanceTimersByTime(20000); });
  expect(view.triggerInput).not.toHaveBeenCalled();
  await Renderer.act(async () => tree.update(<ShopFigurePreview figure={figure} definition={definition} active />));
  expect(jest.getTimerCount()).toBe(1);
  await Renderer.act(() => tree.root.findByType(Rive.RiveView).props.onError({ message: 'Unavailable' }));
  expect(jest.getTimerCount()).toBe(0);
  expect(StyleSheet.flatten(portrait().props.style).opacity).not.toBe(0);
  await Renderer.act(async () => tree.update(<ShopFigurePreview key="new" figure={figure} definition={definition} active />));
  expect(jest.getTimerCount()).toBe(1);
  await Renderer.act(() => tree.unmount());
  expect(jest.getTimerCount()).toBe(0);
});

test('an unavailable optional Jump trigger stops hops without hiding the working idle', async () => {
  view.triggerInput.mockImplementationOnce(() => { throw new Error('Unavailable'); });
  await mount();
  await Renderer.act(async () => { jest.advanceTimersByTime(20000); });
  expect(view.triggerInput).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
  expect(tree.root.findAllByType(Rive.RiveView)).toHaveLength(1);
  expect(StyleSheet.flatten(portrait().props.style).opacity).toBe(0);
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
  expect(jest.getTimerCount()).toBe(0);
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
  await Renderer.act(async () => { jest.advanceTimersByTime(7000); });
  expect(view.triggerInput).toHaveBeenCalledWith('Jump Forward');
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
