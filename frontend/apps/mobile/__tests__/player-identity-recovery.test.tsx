import React from 'react';
import Renderer from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { refreshPlayerIdentity, usePlayerIdentity } from '../src/hooks/use-player-identity';
import type { PlayerSession } from '@rps/game-client/session';

const previous: PlayerSession = { token: 'revoked-token', playerId: 'original-player', expiresAt: new Date(Date.now() + 600_000).toISOString() };
const fresh: PlayerSession = { ...previous, token: 'fresh-token' };
let stored: string | null;
let trees: Renderer.ReactTestRenderer[];
const snapshots: Record<string, ReturnType<typeof usePlayerIdentity>> = {};
function Probe({ id }: { id: string }) { snapshots[id] = usePlayerIdentity(); return null; }
const response = (status: number, value: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => value }) as Response;
let fetchMock: jest.SpyInstance;
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
async function mount(...ids: string[]) {
  await Renderer.act(async () => { for (const id of ids) trees.push(Renderer.create(<Probe id={id} />)); });
}
beforeEach(() => {
  jest.useRealTimers(); jest.clearAllMocks(); trees = []; stored = JSON.stringify(previous);
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.mocked(Keychain.getGenericPassword).mockImplementation(async () => stored ? { username: 'ripsy-player', password: stored, service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH } : false);
  jest.mocked(Keychain.setGenericPassword).mockImplementation(async (_user, value) => { stored = value; return { service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH }; });
  fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(201, fresh));
});
afterEach(async () => {
  await Renderer.act(() => { trees.forEach(tree => tree.unmount()); });
  jest.restoreAllMocks(); jest.useRealTimers();
  if (appStateDescriptor) Object.defineProperty(AppState, 'currentState', appStateDescriptor);
});

test('cached unexpired tokens are validated before ready; concurrent screens share the persisted renewal', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await mount('home', 'shop');
  expect(snapshots.home.isReady).toBe(false); expect(snapshots.shop.sessionToken).toBe('');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer revoked-token' });
  await Renderer.act(async () => finish(response(201, fresh)));
  expect(snapshots.home.sessionToken).toBe('fresh-token'); expect(snapshots.shop.sessionToken).toBe('fresh-token');
  expect(snapshots.shop.playerId).toBe(previous.playerId);
  expect(JSON.parse(stored!)).toEqual(fresh); expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1);
});

test('a revoked but locally unexpired token receives one anonymous fallback, not a wallet prompt or an authentication bypass', async () => {
  const replacement = { ...fresh, playerId: 'new-anonymous-player' };
  fetchMock.mockResolvedValueOnce(response(401, { error: 'Invalid session token' })).mockResolvedValueOnce(response(201, replacement));
  await mount('shop');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer revoked-token' });
  expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  expect(snapshots.shop.sessionToken).toBe('fresh-token'); expect(snapshots.shop.playerId).toBe('new-anonymous-player');
  expect(snapshots.shop.error).toBeNull();
});

test('a network error does not erase the old credential or create another identity; explicit retry updates mounted consumers', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  await mount('home', 'shop');
  expect(snapshots.shop.isReady).toBe(false); expect(snapshots.shop.error).toBe('Offline');
  expect(JSON.parse(stored!)).toEqual(previous); expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  await Renderer.act(async () => { await refreshPlayerIdentity(); });
  expect(snapshots.home.sessionToken).toBe('fresh-token'); expect(snapshots.shop.error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('offline startup retries the session with backoff and stops after recovery, without discarding the cached identity', async () => {
  jest.useFakeTimers();
  fetchMock.mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(new Error('Offline'));
  await mount('home');
  await Renderer.act(async () => { jest.advanceTimersByTime(5_000); });
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(JSON.parse(stored!)).toEqual(previous);
  await Renderer.act(async () => { jest.advanceTimersByTime(9_000); }); expect(fetchMock).toHaveBeenCalledTimes(2);
  await Renderer.act(async () => { jest.advanceTimersByTime(1_000); });
  expect(snapshots.home.isReady).toBe(true); expect(snapshots.home.playerId).toBe(previous.playerId);
  await Renderer.act(async () => { jest.advanceTimersByTime(60_000); }); expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('startup retry waits in background and resumes without opening a wallet', async () => {
  jest.useFakeTimers();
  let change!: (state: 'active' | 'background') => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { change = listener; return { remove }; });
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  await mount('home');
  AppState.currentState = 'background';
  await Renderer.act(async () => { jest.advanceTimersByTime(30_000); }); expect(fetchMock).toHaveBeenCalledTimes(1);
  AppState.currentState = 'active'; await Renderer.act(async () => change('active'));
  expect(snapshots.home.isReady).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(2);
  await Renderer.act(() => trees[0].unmount()); expect(remove).toHaveBeenCalled();
});

test('unmount cancels an offline startup retry', async () => {
  jest.useFakeTimers(); fetchMock.mockRejectedValueOnce(new Error('Offline'));
  await mount('home'); await Renderer.act(() => trees[0].unmount());
  await Renderer.act(async () => { jest.advanceTimersByTime(60_000); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('renewal is not published if secure persistence fails', async () => {
  jest.mocked(Keychain.setGenericPassword).mockRejectedValueOnce(new Error('Storage unavailable'));
  await mount('shop');
  expect(snapshots.shop.isReady).toBe(false); expect(snapshots.shop.error).toBe('Storage unavailable');
  expect(JSON.parse(stored!)).toEqual(previous);
});

test('a false Keychain write result cannot publish an unpersisted session', async () => {
  jest.mocked(Keychain.setGenericPassword).mockResolvedValueOnce(false);
  await mount('shop');
  expect(snapshots.shop.isReady).toBe(false); expect(snapshots.shop.error).toMatch(/save.*securely/);
  expect(JSON.parse(stored!)).toEqual(previous);
});

test('an explicit refresh is shared and reaches all mounted screens, without updating an unmounted screen', async () => {
  await mount('home', 'shop');
  await Renderer.act(() => trees[0].unmount());
  const oldHome = snapshots.home;
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let first!: Promise<PlayerSession>, second!: Promise<PlayerSession>;
  await Renderer.act(() => { first = refreshPlayerIdentity(); second = refreshPlayerIdentity(); });
  expect(first).toBe(second);
  await Renderer.act(async () => { finish(response(201, { ...fresh, token: 'newer-token' })); await first; });
  expect(snapshots.shop.sessionToken).toBe('newer-token'); expect(snapshots.home).toBe(oldHome);
});

test('session refresh is bounded and can retry after timeout without forgetting saved credentials', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  await mount('shop');
  await Renderer.act(async () => { jest.advanceTimersByTime(15_000); });
  expect(snapshots.shop.isReady).toBe(false); expect(snapshots.shop.error).toMatch(/too long to refresh/);
  expect(JSON.parse(stored!)).toEqual(previous);
  await Renderer.act(async () => { await refreshPlayerIdentity(); });
  expect(snapshots.shop.isReady).toBe(true);
});
