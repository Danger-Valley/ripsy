import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Renderer from 'react-test-renderer';
import { Phase, type GameState } from '@rps/core';
import { sounds } from '../src/audio/sounds';
import { useBattleResultSound, useBattleSounds } from '../src/hooks/use-battle-sounds';
import type { SoundName } from '../src/audio/sound-engine';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
jest.mock('../src/audio/sounds', () => ({ sounds: { play: jest.fn(), stopAll: jest.fn(), isActive: jest.fn(() => true) } }));
const mockAudio = jest.mocked(sounds);
let tree: Renderer.ReactTestRenderer;
let play: (name: SoundName) => void;
let background: (value: AppStateStatus) => void;
function Probe({ state, busy = false }: { state: GameState | null; busy?: boolean }) { play = useBattleSounds(); useBattleResultSound(state, busy, 'alice'); return null; }
const active = { gameId: 'battle-sound', p0: 'alice', p1: 'bob', phase: Phase.Active, winner: null } as GameState;
const finished = { ...active, phase: Phase.Finished, winner: 'alice' };
beforeEach(() => {
  jest.clearAllMocks(); mockFocused = true; mockAudio.isActive.mockReturnValue(true);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { background = listener; return { remove: jest.fn() }; });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); });
async function mount(state: GameState | null, busy = false) { await Renderer.act(() => { tree = Renderer.create(<Probe state={state} busy={busy} />); }); }
async function update(state: GameState, busy = false) { await Renderer.act(() => tree.update(<Probe state={state} busy={busy} />)); }

test('victory waits for presentation, plays once and is not repeated by timer renders', async () => {
  await mount(active); await update(finished, true); expect(mockAudio.play).not.toHaveBeenCalled();
  await update(finished); await update({ ...finished, clock0Ms: 400000 }); expect(mockAudio.play.mock.calls).toEqual([['victory']]);
});
test('losing plays defeat, not victory', async () => {
  await mount(active); await update({ ...finished, winner: 'bob', finishReason: 'timeout' }); expect(mockAudio.play.mock.calls).toEqual([['defeat']]);
});
test('finished restoration, cancelled rooms and spectators have no result fanfare', async () => {
  await mount(finished); await update(finished); expect(mockAudio.play).not.toHaveBeenCalled();
  await update({ ...active, gameId: 'next' }); await update({ ...finished, gameId: 'next', finishReason: 'lineup_timeout', winner: null });
  await update({ ...active, gameId: 'spectator', p0: 'other' }); await update({ ...finished, gameId: 'spectator', p0: 'other' });
  expect(mockAudio.play).not.toHaveBeenCalled();
});
test('foreground returning never replays a result consumed in the background', async () => {
  await mount(active); mockAudio.isActive.mockReturnValue(false); await update(finished);
  mockAudio.isActive.mockReturnValue(true); await update(finished); expect(mockAudio.play).not.toHaveBeenCalled();
});
test('backgrounding during the final animation consumes the pending result', async () => {
  await mount(active); await update(finished, true); await Renderer.act(() => background('background'));
  await update(finished); expect(mockAudio.play).not.toHaveBeenCalled();
});
test('blurred game cannot produce sounds or defer its result for returning', async () => {
  await mount(active); const callback = play; mockFocused = false; await update(finished); play('trap');
  expect(mockAudio.stopAll).toHaveBeenCalled(); expect(mockAudio.play).not.toHaveBeenCalled();
  mockFocused = true; await update(finished); expect(play).toBe(callback); expect(mockAudio.play).not.toHaveBeenCalled();
  play('jump'); expect(mockAudio.play).toHaveBeenCalledWith('jump');
});
