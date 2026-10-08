import { AppState } from 'react-native';
import Renderer from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import { disabledUpdatePolicy, type UpdatePolicy } from '@rps/core/app-updates';
import { installedApp } from '../src/updates/app-info';
import { useAppUpdate } from '../src/updates/use-app-update';

jest.mock('../src/updates/app-info', () => ({ installedApp: jest.fn() }));
jest.mock('../src/config', () => ({ getGameWebSocketUrl: () => 'wss://api.ripsy.fun' }));

let tree: Renderer.ReactTestRenderer | undefined;
let value: ReturnType<typeof useAppUpdate>;
let foreground: (state: string) => void;
const originalFetch = global.fetch;
const originalState = AppState.currentState;
const remove = jest.fn();
function Probe() { value = useAppUpdate(); return null; }
function blockedPolicy(): UpdatePolicy {
  const policy = disabledUpdatePolicy();
  policy.ios.minimumBuild = 57; policy.ios.storeUrl = 'https://testflight.apple.com/join/VU1k1zfy';
  return policy;
}
function response(policy: unknown) {
  return { ok: true, text: async () => JSON.stringify(policy) } as Response;
}
function cache(policy: UpdatePolicy, origin = 'https://api.ripsy.fun') {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue({ username: 'update-policy', password: JSON.stringify({ policy, origin }), service: 'test', storage: 'test' } as never);
}
async function mount() { await Renderer.act(async () => { tree = Renderer.create(<Probe />); }); }
async function refresh() { await Renderer.act(async () => { value.refresh(); }); }

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(installedApp).mockReturnValue({ channel: 'ios', build: 56, version: '1.0.0' });
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue(false);
  jest.mocked(Keychain.setGenericPassword).mockClear();
  global.fetch = jest.fn().mockResolvedValue(response(disabledUpdatePolicy()));
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    foreground = listener as typeof foreground;
    return { remove };
  });
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers();
  global.fetch = originalFetch; AppState.currentState = originalState;
});

test('applies minimum, caches verified policy, and accepts a server rollback without a rebuild', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce(response(blockedPolicy()));
  await mount();
  expect(value.checking).toBe(false);
  expect(value.required?.minimumBuild).toBe(57);
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith('update-policy', expect.stringContaining('https://api.ripsy.fun'), expect.objectContaining({ service: 'com.dangervalley.ripsy.update-policy-v1' }));
  await refresh();
  expect(value.required).toBeNull();
  expect(value.error).toBe(false);
});

test('known mandatory policy survives offline startup, bad JSON and subsequent refresh failures', async () => {
  cache(blockedPolicy());
  jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Offline'));
  await mount();
  expect(value.required?.minimumBuild).toBe(57);
  expect(value.error).toBe(true);
  jest.mocked(global.fetch).mockResolvedValueOnce(response({ schema: 2 }));
  await refresh();
  expect(value.required?.minimumBuild).toBe(57);
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
});

test('a sufficiently updated native build unlocks against the cached minimum while offline', async () => {
  cache(blockedPolicy());
  jest.mocked(installedApp).mockReturnValue({ channel: 'ios', build: 57, version: '1.0.0' });
  jest.mocked(global.fetch).mockRejectedValue(new Error('Offline'));
  await mount();
  expect(value.required).toBeNull(); expect(value.checking).toBe(false);
});

test('unknown offline policy fails open, ignores another backend cache and bounds hanging requests', async () => {
  cache(blockedPolicy(), 'https://staging.ripsy.fun');
  let signal!: AbortSignal;
  jest.mocked(global.fetch).mockImplementation((_url, options) => { signal = options!.signal!; return new Promise(() => {}); });
  await mount();
  expect(value.checking).toBe(true);
  expect(value.required).toBeNull();
  await Renderer.act(async () => { jest.advanceTimersByTime(4000); });
  expect(signal.aborted).toBe(true);
  expect(value.checking).toBe(false); expect(value.required).toBeNull();
});

test('hanging device storage cannot hold startup; a late known minimum still applies', async () => {
  let resolve!: (saved: never) => void;
  jest.mocked(Keychain.getGenericPassword).mockImplementation(() => new Promise(r => { resolve = r; }));
  jest.mocked(global.fetch).mockRejectedValue(new Error('Offline'));
  await mount();
  await Renderer.act(async () => { jest.advanceTimersByTime(800); });
  expect(value.checking).toBe(false);
  await Renderer.act(async () => resolve({ password: JSON.stringify({ origin: 'https://api.ripsy.fun', policy: blockedPolicy() }) } as never));
  expect(value.required?.minimumBuild).toBe(57);
});

test('a late stale cached gate cannot overwrite a fresh server rollback', async () => {
  let resolve!: (saved: never) => void;
  jest.mocked(Keychain.getGenericPassword).mockImplementation(() => new Promise(r => { resolve = r; }));
  await mount();
  await Renderer.act(async () => { jest.advanceTimersByTime(800); });
  await Renderer.act(async () => resolve({ password: JSON.stringify({ origin: 'https://api.ripsy.fun', policy: blockedPolicy() }) } as never));
  expect(value.required).toBeNull();
});

test('foreground and active interval recheck, background does not poll, and in-flight checks deduplicate', async () => {
  await mount();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => foreground('active'));
  expect(global.fetch).toHaveBeenCalledTimes(2);
  await Renderer.act(async () => { jest.advanceTimersByTime(60_000); });
  expect(global.fetch).toHaveBeenCalledTimes(3);
  AppState.currentState = 'background';
  await Renderer.act(async () => { foreground('background'); jest.advanceTimersByTime(60_000); });
  expect(global.fetch).toHaveBeenCalledTimes(3);
  let resolve!: (response: Response) => void;
  jest.mocked(global.fetch).mockImplementation(() => new Promise(r => { resolve = r; }));
  await refresh(); await refresh();
  expect(global.fetch).toHaveBeenCalledTimes(4);
  await Renderer.act(async () => resolve(response(blockedPolicy())));
  expect(value.required?.minimumBuild).toBe(57);
  await Renderer.act(() => tree?.unmount()); tree = undefined;
  expect(remove).toHaveBeenCalled();
});

test('no native metadata never guesses a build or fetches policy', async () => {
  jest.mocked(installedApp).mockReturnValue(null);
  await mount(); expect(global.fetch).not.toHaveBeenCalled(); expect(value.checking).toBe(false);
});

test('unavailable device storage and a first-launch outage cannot crash or lock offline play', async () => {
  jest.mocked(Keychain.getGenericPassword).mockImplementationOnce(() => { throw new Error('Storage unavailable'); });
  jest.mocked(global.fetch).mockRejectedValue(new Error('Offline'));
  await mount();
  expect(value.checking).toBe(false); expect(value.required).toBeNull(); expect(value.error).toBe(true);
});

test('HTTP errors, malformed JSON and oversized policies never clear a known required minimum', async () => {
  cache(blockedPolicy());
  const bad = [
    { ok: false, text: async () => JSON.stringify(disabledUpdatePolicy()) },
    { ok: true, text: async () => '{not-json' },
    { ok: true, text: async () => ' '.repeat(16_385) },
  ];
  jest.mocked(global.fetch).mockResolvedValue(bad[0] as Response);
  await mount();
  for (const result of bad) {
    jest.mocked(global.fetch).mockResolvedValue(result as Response);
    await refresh();
    expect(value.required?.minimumBuild).toBe(57);
    expect(value.error).toBe(true);
  }
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
});
