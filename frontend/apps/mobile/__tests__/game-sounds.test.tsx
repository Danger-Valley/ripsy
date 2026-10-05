import React from 'react';
import { Animated } from 'react-native';
import Renderer from 'react-test-renderer';
import { Choice, Owner, Phase, Piece, toIdx, type GameState } from '@rps/core';
import { useGameAnimationQueue } from '../src/hooks/use-game-animation-queue';
import { RIVE_TRAP_DURATION_MS } from '../src/game-animation';

const sound = jest.fn();
type Queue = ReturnType<typeof useGameAnimationQueue>;
let animation: Queue;
let tree: Renderer.ReactTestRenderer;
function Probe({ state }: { state: GameState }) { animation = useGameAnimationQueue(state, sound); return null; }
beforeEach(() => {
  sound.mockClear(); jest.useFakeTimers();
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return { reset: jest.fn(), start: callback => { timer = setTimeout(() => callback?.({ finished: true }), config.duration); }, stop: () => { if (timer) clearTimeout(timer); } };
  });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
async function mount(state: GameState) { await Renderer.act(() => { tree = Renderer.create(<Probe state={state} />); }); }
async function update(state: GameState) { await Renderer.act(() => tree.update(<Probe state={state} />)); }
async function tick(ms: number) { await Renderer.act(() => jest.advanceTimersByTime(ms)); }
function active(): GameState {
  const owners = Array<Owner>(49).fill(Owner.None); const pieces = Array<Piece>(49).fill(Piece.Empty);
  owners[toIdx(0, 5)] = Owner.P0; pieces[toIdx(0, 5)] = Piece.Rock;
  return { gameId: 'sound-test', phase: Phase.Active, isP1Turn: false, owners, pieces, live0: 2, live1: 2, attacker: Piece.Empty, defender: Piece.Empty, outcome: 0, playerChoice: Choice.None, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, p0: 'alice', p1: 'bob', winner: null };
}
function move(previous: GameState) {
  const next = { ...previous, owners: [...previous.owners], pieces: [...previous.pieces], isP1Turn: true, tieFrom: { x: 0, y: 5 }, tieTo: { x: 0, y: 4 } };
  next.owners[toIdx(0, 5)] = Owner.None; next.pieces[toIdx(0, 5)] = Piece.Empty;
  next.owners[toIdx(0, 4)] = Owner.P0; next.pieces[toIdx(0, 4)] = previous.pieces[toIdx(0, 5)]!;
  return next;
}
test('jump sounds only once at the Rive trigger; landing waits for the authored duration', async () => {
  const previous = active(); await mount(previous); await update(move(previous));
  expect(sound).not.toHaveBeenCalled();
  await Renderer.act(() => { animation.startActiveMove(100); animation.startActiveMove(100); });
  expect(sound.mock.calls).toEqual([['jump']]);
  await tick(749); expect(sound.mock.calls).toEqual([['jump']]);
  await tick(1); expect(sound.mock.calls).toEqual([['jump'], ['land']]);
});
test('watchdog-only movement remains silent and never pretends a Rive trigger fired', async () => {
  const previous = active(); await mount(previous); await update(move(previous)); await tick(2400);
  expect(sound).not.toHaveBeenCalled();
});
test.each([Piece.Rock, Piece.Paper, Piece.Scissors])('winner weapon %s sounds once only after its actual Attack', async piece => {
  const previous = active(); previous.pieces[toIdx(0, 5)] = piece;
  previous.owners[toIdx(0, 4)] = Owner.P1; previous.pieces[toIdx(0, 4)] = Piece.Rock;
  const result = { ...move(previous), attacker: piece, defender: Piece.Rock, outcome: 1, live1: 1 };
  await mount(previous); await update(result); await tick(401);
  expect(animation.combatPhase).toBe('attack'); expect(sound).not.toHaveBeenCalled();
  await Renderer.act(() => { animation.startActiveAttack(); animation.startActiveAttack(); });
  const name = piece === Piece.Rock ? 'rock' : piece === Piece.Paper ? 'paper' : 'scissors';
  expect(sound.mock.calls).toEqual([[name]]);
});
test('trap waits for both triggers and sounds again for a second real collision', async () => {
  const previous = active(); previous.owners[toIdx(0, 4)] = Owner.P1; previous.pieces[toIdx(0, 4)] = Piece.Trap;
  previous.owners[toIdx(1, 4)] = Owner.P0; previous.pieces[toIdx(1, 4)] = Piece.Paper;
  const first = { ...previous, owners: [...previous.owners], pieces: [...previous.pieces], attacker: Piece.Rock, defender: Piece.Trap, outcome: -1, live0: 1, isP1Turn: true, tieFrom: { x: 0, y: 5 }, tieTo: { x: 0, y: 4 } };
  first.owners[toIdx(0, 5)] = Owner.None; first.pieces[toIdx(0, 5)] = Piece.Empty;
  await mount(previous); await update(first);
  await Renderer.act(() => { animation.startActiveTrap('Trap Activate'); animation.startActiveTrap('Trap Activate'); });
  expect(sound).not.toHaveBeenCalled();
  await Renderer.act(() => { animation.startActiveTrap('Fall In Trap'); animation.startActiveTrap('Fall In Trap'); });
  expect(sound.mock.calls).toEqual([['trap']]); await tick(RIVE_TRAP_DURATION_MS);
  const second = { ...first, owners: [...first.owners], pieces: [...first.pieces], attacker: Piece.Paper, live0: 0, tieFrom: { x: 1, y: 4 } };
  second.owners[toIdx(1, 4)] = Owner.None; second.pieces[toIdx(1, 4)] = Piece.Empty;
  await update(second);
  await Renderer.act(() => { animation.startActiveTrap('Fall In Trap'); animation.startActiveTrap('Trap Activate'); });
  expect(sound.mock.calls).toEqual([['trap'], ['trap']]);
});
test('first and repeated tie play only when the held reveal finishes, never on a choice or clock update', async () => {
  const previous = active(); previous.owners[toIdx(0, 4)] = Owner.P1; previous.pieces[toIdx(0, 4)] = Piece.Rock;
  const tied = { ...previous, attacker: Piece.Rock, defender: Piece.Rock, tiePending: true, tieRound: 0, isP1Turn: true, tieFrom: { x: 0, y: 5 }, tieTo: { x: 0, y: 4 } };
  await mount(previous); await update(tied); await tick(619); expect(sound).not.toHaveBeenCalled();
  await tick(1); expect(sound.mock.calls).toEqual([['tie']]);
  await update({ ...tied, clock0Ms: 550000, playerChoice: Choice.Rock }); expect(sound).toHaveBeenCalledTimes(1);
  const repeated = { ...tied, tieRound: 1, attacker: Piece.Paper, defender: Piece.Paper };
  await update(repeated); await tick(899); expect(sound).toHaveBeenCalledTimes(1);
  await tick(1); expect(sound.mock.calls).toEqual([['tie'], ['tie']]);
});
test('already-restored board and ordinary clock/selection state produce no gameplay sound', async () => {
  const state = active(); await mount(state); await update({ ...state, clock0Ms: 580000 }); await tick(500);
  expect(sound).not.toHaveBeenCalled();
});
test('unmount cancels future cues during presentation', async () => {
  const previous = active(); await mount(previous); await update(move(previous));
  await Renderer.act(() => animation.startActiveMove(100)); await Renderer.act(() => tree.unmount()); await tick(1000);
  expect(sound.mock.calls).toEqual([['jump']]);
});
