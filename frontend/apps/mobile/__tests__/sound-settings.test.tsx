import React from 'react';
import { Switch, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { SoundSettings } from '../src/components/sound-settings';
import type { SoundState } from '../src/audio/sound-engine';
import { sounds } from '../src/audio/sounds';

let mockState: SoundState;
jest.mock('../src/audio/sounds', () => ({ sounds: { play: jest.fn(), setEnabled: jest.fn(async () => undefined), setVolume: jest.fn(async () => undefined), retrySave: jest.fn() } }));
const mockAudio = jest.mocked(sounds);
jest.mock('../src/hooks/use-sounds', () => ({ useSounds: () => mockState }));
let tree: Renderer.ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); mockState = { enabled: true, volume: 0.7, available: true, loading: false, saveError: false }; });
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); });
async function mount() { await Renderer.act(() => { tree = Renderer.create(<SoundSettings />); }); }
const button = (label: string) => tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0]!;
const text = (value: string) => tree.root.findAllByType(Text).some(node => node.props.children === value);

test('sound settings has an accessible switch, volume and explicit preview', async () => {
  await mount(); expect(tree.root.findByType(Switch).props.accessibilityLabel).toBe('Sound effects');
  await Renderer.act(() => button('Try the sound').props.onPress());
  expect(mockAudio.play).toHaveBeenCalledTimes(1); expect(mockAudio.play).toHaveBeenCalledWith('ready');
});
test('switch off persists quiet mode without emitting feedback', async () => {
  await mount(); await Renderer.act(async () => tree.root.findByType(Switch).props.onValueChange(false));
  expect(mockAudio.setEnabled).toHaveBeenCalledWith(false); expect(mockAudio.play).not.toHaveBeenCalled();
});
test('unmute and volume changes provide one preview, not button plus preview duplicates', async () => {
  await mount(); await Renderer.act(async () => button('Quieter sound effects').props.onPress());
  expect(mockAudio.setVolume.mock.calls[0]?.[0]).toBeCloseTo(0.6); expect(mockAudio.play).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => tree.root.findByType(Switch).props.onValueChange(true));
  expect(mockAudio.play).toHaveBeenCalledTimes(2);
});
test.each(['loading', 'unavailable', 'muted'] as const)('%s does not offer fake playback', async state => {
  if (state === 'loading') { mockState.loading = true; mockState.available = false; }
  if (state === 'unavailable') mockState.available = false;
  if (state === 'muted') mockState.enabled = false;
  await mount();
  if (state !== 'muted') expect(tree.root.findByType(Switch).props.disabled).toBe(true);
  else expect(button('Try the sound').props.disabled).toBe(true);
  expect(mockAudio.play).not.toHaveBeenCalled();
});
test('saving error is truthful and offers retry', async () => {
  mockState.saveError = true; await mount();
  expect(text('Couldn’t save your sound settings. Your current choice still works.')).toBe(true);
  await Renderer.act(() => button('Retry saving sound settings').props.onPress()); expect(mockAudio.retrySave).toHaveBeenCalledTimes(1);
});
