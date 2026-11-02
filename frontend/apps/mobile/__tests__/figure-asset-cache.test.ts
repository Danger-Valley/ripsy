import { NativeModules } from 'react-native';
import { cacheFigureAnimation, cacheFigurePortrait } from '../src/figures/asset-cache';

const resource = { url: 'https://www.ripsy.fun/new.png', sha256: 'a'.repeat(64), bytes: 100 };
afterEach(() => { delete NativeModules.RipsyFigureCache; });
test('portrait requests deduplicate, do not collide with Rives, and can retry after failure', async () => {
  let finish!: (uri: string) => void;
  const native = { getAnimation: jest.fn().mockResolvedValue('file:///a.riv'),
    getPortrait: jest.fn(() => new Promise<string>(resolve => { finish = resolve; })) };
  NativeModules.RipsyFigureCache = native;
  const first = cacheFigurePortrait(resource), second = cacheFigurePortrait(resource);
  expect(first).toBe(second); expect(native.getPortrait).toHaveBeenCalledTimes(1);
  await expect(cacheFigureAnimation({ ...resource, contract: 1 })).resolves.toBe('file:///a.riv');
  finish('file:///a.png'); await expect(first).resolves.toBe('file:///a.png');
  native.getPortrait.mockRejectedValueOnce(new Error('Hash mismatch'));
  await expect(cacheFigurePortrait(resource)).rejects.toThrow('Hash mismatch');
  native.getPortrait.mockResolvedValueOnce('file:///a.png');
  await expect(cacheFigurePortrait(resource)).resolves.toBe('file:///a.png');
});
test('different expected lengths never share a verification promise', async () => {
  const native = { getPortrait: jest.fn().mockResolvedValue('file:///a.png') };
  NativeModules.RipsyFigureCache = native;
  await Promise.all([cacheFigurePortrait(resource), cacheFigurePortrait({ ...resource, bytes: 101 })]);
  expect(native.getPortrait).toHaveBeenCalledTimes(2);
});
test('an old binary without PNG bridge rejects safely without changing Rive support', async () => {
  NativeModules.RipsyFigureCache = { getAnimation: jest.fn().mockResolvedValue('file:///a.riv') };
  await expect(cacheFigurePortrait(resource)).rejects.toThrow('update the app');
  await expect(cacheFigureAnimation({ ...resource, contract: 1 })).resolves.toBe('file:///a.riv');
});
