import React from 'react';
import { AppState, NativeModules, type AppStateStatus } from 'react-native';
import * as Keychain from 'react-native-keychain';
import Renderer from 'react-test-renderer';
import { sounds } from '../src/audio/sounds';
import { useSoundLifecycle } from '../src/hooks/use-sounds';

let tree: Renderer.ReactTestRenderer;
let change: (value: AppStateStatus) => void;
const remove = jest.fn();
const native = { prepare: jest.fn<Promise<boolean>, [Record<string, string>]>(async () => true), play: jest.fn(), stopAll: jest.fn(), releaseSounds: jest.fn() };
function Probe() { useSoundLifecycle(); return null; }
beforeEach(() => {
  jest.clearAllMocks(); NativeModules.RipsyAudio = native;
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue(false);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { change = listener; return { remove }; });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); sounds.shutdown(); delete NativeModules.RipsyAudio; jest.restoreAllMocks(); });

test('native pack is prepared once, app-state changes stop it and unmount removes listener/releases', async () => {
  await Renderer.act(async () => { tree = Renderer.create(<Probe />); });
  expect(native.prepare).toHaveBeenCalledTimes(1);
  expect(Object.keys(native.prepare.mock.calls[0]?.[0] ?? {})).toHaveLength(13);
  await Renderer.act(() => change('active')); sounds.play('jump'); expect(native.play).toHaveBeenCalledWith('jump', 0.7);
  await Renderer.act(() => change('background')); sounds.play('rock'); expect(native.play).toHaveBeenCalledTimes(1);
  await Renderer.act(() => change('active')); expect(native.play).toHaveBeenCalledTimes(1);
  await Renderer.act(() => tree.unmount()); expect(remove).toHaveBeenCalledTimes(1); expect(native.releaseSounds).toHaveBeenCalledTimes(1);
});
test('mute and volume use their own storage service without exposing gameplay or wallet data', async () => {
  await sounds.start(); await sounds.setEnabled(false); await sounds.setVolume(0.4);
  expect(Keychain.setGenericPassword).toHaveBeenLastCalledWith('ripsy-sounds', '{"enabled":false,"volume":0.4}', expect.objectContaining({ service: 'com.dangervalley.ripsy.sound-preferences' }));
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue({ username: 'ripsy-sounds', password: '{"enabled":false,"volume":0.4}', service: 'sound', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  sounds.shutdown(); await sounds.start(); sounds.setActive(true); sounds.play('victory');
  expect(sounds.snapshot()).toMatchObject({ enabled: false, volume: 0.4 }); expect(native.play).not.toHaveBeenCalled();
});
test('invalid stored settings become quiet with a recoverable error', async () => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue({ username: 'ripsy-sounds', password: '{"volume":"bad"}', service: 'sound', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  await sounds.start(); expect(sounds.snapshot()).toMatchObject({ enabled: false, saveError: true });
});
test('old native builds without audio do not crash or falsely report available sound', async () => {
  delete NativeModules.RipsyAudio; await sounds.start(); sounds.play('click');
  expect(sounds.snapshot()).toMatchObject({ loading: false, available: false });
});
