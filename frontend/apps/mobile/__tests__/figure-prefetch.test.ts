import { Image } from 'react-native';
import type { FigureDefinition } from '@rps/core/figure-manifest';
import { FIGURES } from '@rps/core/shop';
import { cacheFigureAnimation, cacheFigurePortrait } from '../src/figures/asset-cache';
import { bundledHashes, bundledPortraitHashes } from '../src/figures/bundled-resources';
import { figurePrefetchBudget, prefetchFigureResources } from '../src/figures/prefetch';

jest.mock('../src/figures/asset-cache');
const hash = (n: number) => n.toString(16).padStart(64, '0');
function figure(n = 42): FigureDefinition {
  const imageUrl = `https://www.ripsy.fun/figures/future-${n}.png`;
  return { id: `future-${n}`, variant: n, name: 'Future', description: '', purchasable: true, seekerExclusive: false, imageUrl,
    animation: { url: `https://www.ripsy.fun/figures/future-${n}.riv`, sha256: hash(n), bytes: 500, contract: 1 },
    portrait: { url: imageUrl, sha256: hash(n + 100), bytes: 100 } };
}
const onPortraitReady = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(cacheFigureAnimation).mockResolvedValue('file:///verified.riv');
  jest.mocked(cacheFigurePortrait).mockResolvedValue('file:///verified.png');
  jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('unknown server-only identities preload both resources without constructing Rive views', async () => {
  const next = figure();
  await prefetchFigureResources([next], { isActive: () => true, onPortraitReady });
  expect(cacheFigureAnimation).toHaveBeenCalledWith(next.animation);
  expect(cacheFigurePortrait).toHaveBeenCalledWith(next.portrait);
  expect(onPortraitReady).toHaveBeenCalledWith(next, 'file:///verified.png');
  expect(Image.prefetch).not.toHaveBeenCalled();
});
test('byte-identical bundled models and portraits do not download', async () => {
  const bundled = FIGURES.map(f => ({ ...f, imageUrl: `https://www.ripsy.fun/${f.id}.png`,
    animation: { url: `https://www.ripsy.fun/${f.id}.riv`, sha256: bundledHashes[f.variant], bytes: 500, contract: 1 as const },
    portrait: { url: `https://www.ripsy.fun/${f.id}.png`, sha256: bundledPortraitHashes[f.id], bytes: 100 } }));
  await prefetchFigureResources(bundled, { isActive: () => true, onPortraitReady });
  expect(cacheFigureAnimation).not.toHaveBeenCalled(); expect(cacheFigurePortrait).not.toHaveBeenCalled();
  expect(Image.prefetch).not.toHaveBeenCalled();
});
test('a server replacement of a bundled asset is fetched rather than silently using old art', async () => {
  const replaced = { ...figure(), id: 'fig2', variant: 2 };
  await prefetchFigureResources([replaced], { isActive: () => true, onPortraitReady });
  expect(cacheFigureAnimation).toHaveBeenCalledTimes(1); expect(cacheFigurePortrait).toHaveBeenCalledTimes(1);
});
test('legacy manifests still warm their portrait URLs with platform image caching', async () => {
  const legacy = { ...figure(), portrait: undefined };
  await prefetchFigureResources([legacy, legacy], { isActive: () => true, onPortraitReady });
  expect(cacheFigureAnimation).toHaveBeenCalledTimes(1);
  expect(Image.prefetch).toHaveBeenCalledTimes(1); expect(Image.prefetch).toHaveBeenCalledWith(legacy.imageUrl);
  expect(cacheFigurePortrait).not.toHaveBeenCalled();
});
test('failed files do not block other models or create an unbounded retry loop', async () => {
  jest.mocked(cacheFigureAnimation).mockRejectedValueOnce(new Error('Offline'));
  await prefetchFigureResources([figure(), figure(43)], { isActive: () => true, onPortraitReady });
  expect(cacheFigureAnimation).toHaveBeenCalledTimes(2); expect(onPortraitReady).toHaveBeenCalledTimes(2);
});
test('there are at most two in-flight jobs and no further jobs launch in background', async () => {
  const finish: Array<(uri: string) => void> = [];
  const delayed = () => new Promise<string>(resolve => finish.push(resolve));
  jest.mocked(cacheFigureAnimation).mockImplementation(delayed);
  jest.mocked(cacheFigurePortrait).mockImplementation(delayed);
  let active = true;
  const pass = prefetchFigureResources([figure(), figure(43)], { isActive: () => active, onPortraitReady });
  expect(finish).toHaveLength(2);
  active = false;
  finish.forEach(resolve => resolve('file:///complete'));
  await pass;
  expect(cacheFigureAnimation).toHaveBeenCalledTimes(1); expect(cacheFigurePortrait).toHaveBeenCalledTimes(1);
});
test('prefetch disk budget is bounded separately from on-demand loading', async () => {
  const oversized = Array.from({ length: 12 }, (_, n) => ({ ...figure(n + 42), imageUrl: '', portrait: undefined,
    animation: { ...figure(n + 42).animation, bytes: 8 * 1024 * 1024 } }));
  await prefetchFigureResources(oversized, { isActive: () => true, onPortraitReady });
  expect(cacheFigureAnimation).toHaveBeenCalledTimes(figurePrefetchBudget / (8 * 1024 * 1024));
});
