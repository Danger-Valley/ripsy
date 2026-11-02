import React from 'react';
import Renderer from 'react-test-renderer';
import * as RN from 'react-native';
import * as Keychain from 'react-native-keychain';
import type { FigureDefinition, FigureManifest } from '@rps/core/figure-manifest';
import { FIGURES } from '@rps/core/shop';
import { bundledHashes, bundledPortraitHashes } from '../src/figures/bundled-resources';

const getCatalog = jest.fn();
const base: FigureDefinition[] = FIGURES.map(f => ({ ...f, imageUrl: `https://www.ripsy.fun/figures/${f.id}.png`,
  animation: { url: `https://www.ripsy.fun/figures/${f.id}.riv`, sha256: bundledHashes[f.variant], bytes: 500, contract: 1 },
  portrait: { url: `https://www.ripsy.fun/figures/${f.id}.png`, sha256: bundledPortraitHashes[f.id], bytes: 100 } }));
const future: FigureDefinition = { id: 'future-fighter', variant: 42, name: 'Future fighter', description: 'Server only', purchasable: true, seekerExclusive: false,
  imageUrl: `https://www.ripsy.fun/figures/future.png?v=${'b'.repeat(64)}`,
  animation: { url: 'https://www.ripsy.fun/figures/future.riv', sha256: 'a'.repeat(64), bytes: 500, contract: 1 },
  portrait: { url: `https://www.ripsy.fun/figures/future.png?v=${'b'.repeat(64)}`, sha256: 'b'.repeat(64), bytes: 100 } };
const manifest = (figures = [...base, future]): FigureManifest => ({ schema: 1, figures });
let catalog: typeof import('../src/figures/catalog');
let snapshot: ReturnType<typeof catalog.useFigureCatalog>;
let tree: Renderer.ReactTestRenderer | undefined;
let listener: ((state: RN.AppStateStatus) => void) | undefined;
let remove: jest.Mock;
const originalState = Object.getOwnPropertyDescriptor(RN.AppState, 'currentState');
const native = {
  getAnimation: jest.fn(async (_url: string, hash: string) => `file:///${hash}.riv`),
  getPortrait: jest.fn(async (_url: string, hash: string) => `file:///${hash}.png`),
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function Probe() {
  catalog.useFigureCatalogLifecycle();
  snapshot = catalog.useFigureCatalog();
  return <RN.Text>{snapshot.map(f => f.name).join(', ')}</RN.Text>;
}
async function mount() { await Renderer.act(async () => { tree = Renderer.create(<Probe />); await flush(); }); }
async function state(next: RN.AppStateStatus) {
  await Renderer.act(async () => {
    Object.defineProperty(RN.AppState, 'currentState', { configurable: true, writable: true, value: next });
    listener?.(next); await flush();
  });
}
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  jest.clearAllMocks();
  getCatalog.mockReset().mockResolvedValue(manifest());
  jest.mocked(Keychain.getGenericPassword).mockReset().mockResolvedValue(false);
  jest.mocked(Keychain.setGenericPassword).mockReset().mockResolvedValue({ service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  native.getAnimation.mockReset().mockImplementation(async (_url, hash) => `file:///${hash}.riv`);
  native.getPortrait.mockReset().mockImplementation(async (_url, hash) => `file:///${hash}.png`);
  RN.NativeModules.RipsyFigureCache = native;
  Object.defineProperty(RN.AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  remove = jest.fn();
  jest.spyOn(RN.AppState, 'addEventListener').mockImplementation((_type, callback) => { listener = callback; return { remove }; });
  jest.spyOn(RN.Image, 'prefetch').mockResolvedValue(true);
  // Fresh process-local catalog state, but one shared React/native runtime.
  jest.isolateModules(() => {
    jest.doMock('react', () => React);
    jest.doMock('react-native', () => RN);
    jest.doMock('react-native-keychain', () => Keychain);
    jest.doMock('@rps/game-client/shop', () => ({ ShopClient: jest.fn(() => ({ figures: getCatalog })) }));
    catalog = require('../src/figures/catalog');
  });
});
afterEach(async () => {
  await Renderer.act(async () => { tree?.unmount(); await flush(); });
  tree = undefined; listener = undefined;
  delete RN.NativeModules.RipsyFigureCache;
  if (originalState) Object.defineProperty(RN.AppState, 'currentState', originalState);
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});

test('root startup discovers and warms an unknown fighter without visiting Shop or Army', async () => {
  await mount();
  expect(getCatalog).toHaveBeenCalledTimes(1);
  expect(snapshot.find(f => f.id === future.id)?.name).toBe(future.name);
  expect(native.getAnimation).toHaveBeenCalledTimes(1); expect(native.getPortrait).toHaveBeenCalledTimes(1);
  expect(catalog.figurePortrait(future.id, snapshot, 'https://www.ripsy.fun/figures/future.png')).toEqual({ uri: `file:///${future.portrait!.sha256}.png` });
  expect(JSON.stringify(jest.mocked(Keychain.setGenericPassword).mock.calls)).not.toContain('file://');
});
test('no-op refresh preserves snapshots and animation descriptors after disk portraits arrive', async () => {
  await mount(); const before = snapshot; const animation = snapshot.at(-1)!.animation;
  // JSON property order is not a resource identity change.
  getCatalog.mockResolvedValue(manifest([...base, { ...future, animation: {
    contract: 1, bytes: future.animation.bytes, sha256: future.animation.sha256, url: future.animation.url,
  } }]));
  await Renderer.act(async () => { await catalog.refreshFigureCatalog(true); await flush(); });
  expect(snapshot).toBe(before); expect(snapshot.at(-1)!.animation).toBe(animation);
});
test('cached names and resources restore before an offline manifest request, with bounded retry', async () => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue({ username: 'figures', password: JSON.stringify(manifest()), service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  getCatalog.mockRejectedValue(new Error('Offline'));
  await mount();
  expect(snapshot.at(-1)!.name).toBe(future.name); expect(native.getAnimation).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => { jest.advanceTimersByTime(3000); await flush(); });
  await Renderer.act(async () => { jest.advanceTimersByTime(9000); await flush(); });
  await Renderer.act(async () => { jest.advanceTimersByTime(60000); await flush(); });
  expect(getCatalog).toHaveBeenCalledTimes(3);
  expect(snapshot.find(f => f.id === 'fig1')).toBeDefined();
  await Renderer.act(() => tree!.unmount()); tree = undefined;
  expect(remove).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});
test('foreground discovers a later registration; duplicate active events do not refetch', async () => {
  await mount(); await state('active'); expect(getCatalog).toHaveBeenCalledTimes(1);
  const later = { ...future, id: 'later-fighter', variant: 43, name: 'Later fighter' };
  getCatalog.mockResolvedValue(manifest([...base, future, later]));
  await state('background'); await state('active');
  expect(getCatalog).toHaveBeenCalledTimes(2); expect(snapshot.at(-1)!.name).toBe(later.name);
});
test('a keychain write failure does not discard a valid live manifest or trigger retries', async () => {
  jest.mocked(Keychain.setGenericPassword).mockRejectedValue(new Error('Storage unavailable'));
  await mount();
  await Renderer.act(async () => { jest.advanceTimersByTime(20000); await flush(); });
  expect(getCatalog).toHaveBeenCalledTimes(1); expect(snapshot.at(-1)!.name).toBe(future.name);
});
test('malformed or remapped refresh leaves the working snapshot and resources unchanged', async () => {
  await mount(); const before = snapshot;
  getCatalog.mockResolvedValue(manifest([...base, { ...future, variant: 43 }]));
  await expect(catalog.refreshFigureCatalog(true)).rejects.toThrow('identities changed');
  getCatalog.mockResolvedValue(manifest([...base, { ...future, portrait: { ...future.portrait!, sha256: 'invalid' } }]));
  await expect(catalog.refreshFigureCatalog(true)).rejects.toThrow('Invalid figure catalog');
  expect(snapshot).toBe(before);
});
test('a corrupt saved identity cannot remap a bundled fighter on cold offline startup', async () => {
  const poisoned = manifest(base.map(f => f.id === 'fig2' ? { ...f, id: 'imposter' } : f));
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue({ username: 'figures', password: JSON.stringify(poisoned), service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  getCatalog.mockRejectedValue(new Error('Offline')); await mount();
  expect(snapshot.some(f => f.id === 'imposter')).toBe(false);
  expect(snapshot.find(f => f.variant === 2)!.id).toBe('fig2');
});
test('stale PNG completion cannot overwrite a newer portrait; metadata-only updates preserve Rive identity', async () => {
  let finish!: (uri: string) => void;
  native.getPortrait.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  await mount(); const animation = snapshot.at(-1)!.animation;
  const imageUrl = `https://www.ripsy.fun/figures/future.png?v=${'c'.repeat(64)}`;
  const changed = { ...future, name: 'Renamed on server', imageUrl, portrait: { ...future.portrait!, sha256: 'c'.repeat(64), url: imageUrl } };
  getCatalog.mockResolvedValue(manifest([...base, changed]));
  await Renderer.act(async () => { await catalog.refreshFigureCatalog(true); await flush(); });
  expect(catalog.figurePortrait(future.id, snapshot)).toEqual({ uri: imageUrl });
  await Renderer.act(async () => { finish('file:///stale.png'); await flush(); });
  expect(snapshot.at(-1)!.name).toBe(changed.name);
  expect(catalog.figurePortrait(future.id, snapshot)).toEqual({ uri: `file:///${changed.portrait.sha256}.png` });
  expect(snapshot.at(-1)!.animation).toBe(animation);
});
test('a withdrawn catalog entry retains its historical definition without persisting local file URIs', async () => {
  await mount(); getCatalog.mockResolvedValue(manifest(base));
  await Renderer.act(async () => { await catalog.refreshFigureCatalog(true); await flush(); });
  expect(snapshot.find(f => f.id === future.id)).toBeDefined();
  const saved = JSON.parse(jest.mocked(Keychain.setGenericPassword).mock.calls.at(-1)![1]);
  expect(saved.figures.at(-1).id).toBe(future.id); expect(JSON.stringify(saved)).not.toContain('file://');
});
test('an evicted or invalid PNG does not retain a broken local image path after revalidation fails', async () => {
  await mount();
  expect(catalog.figurePortrait(future.id, snapshot)).toEqual({ uri: `file:///${future.portrait!.sha256}.png` });
  native.getPortrait.mockRejectedValue(new Error('File evicted and network offline'));
  await Renderer.act(async () => { await catalog.refreshFigureCatalog(true); await flush(); });
  expect(catalog.figurePortrait(future.id, snapshot)).toEqual({ uri: future.imageUrl });
});
test('a pre-background request failure cannot schedule duplicate retry generations', async () => {
  let reject!: (reason: Error) => void;
  getCatalog.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await mount(); await state('background'); await state('active');
  getCatalog.mockRejectedValue(new Error('Offline'));
  await Renderer.act(async () => { reject(new Error('Offline')); await flush(); });
  expect(jest.getTimerCount()).toBe(1);
  await Renderer.act(async () => { jest.advanceTimersByTime(3000); await flush(); });
  expect(getCatalog).toHaveBeenCalledTimes(2);
});
