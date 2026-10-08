import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Choice, HEIGHT, Owner, Phase, Piece, WIDTH, type GameState } from '@rps/core';
import { useLastOpponentMove } from '../src/hooks/use-last-opponent-move';

function activeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners: Array(WIDTH * HEIGHT).fill(Owner.None), pieces: Array(WIDTH * HEIGHT).fill(Piece.Empty),
    live0: 14, live1: 14, attacker: Piece.Empty, defender: Piece.Empty, outcome: 0,
    playerChoice: Choice.None, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
    ...overrides,
  };
}

async function probe(state: GameState | null, owner: Owner = Owner.P0) {
  let lastMove: ReturnType<typeof useLastOpponentMove> = null;
  function Probe({ current, ownOwner }: { current: GameState | null; ownOwner: Owner }) {
    lastMove = useLastOpponentMove(current, ownOwner);
    return null;
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe current={state} ownOwner={owner} />); });
  return {
    get lastMove() { return lastMove; },
    async update(current: GameState | null, ownOwner: Owner = owner) {
      await ReactTestRenderer.act(() => { tree.update(<Probe current={current} ownOwner={ownOwner} />); });
    },
    async close() { await ReactTestRenderer.act(() => tree.unmount()); },
  };
}

const moveCoordinates = { tieFrom: { x: 2, y: 1 }, tieTo: { x: 2, y: 2 } };

test.each([Owner.P0, Owner.P1])('restores the latest opponent destination for owner %s', async owner => {
  const result = await probe(activeState({ ...moveCoordinates, isP1Turn: owner === Owner.P1 }), owner);
  expect(result.lastMove).toEqual(moveCoordinates.tieTo);
  await result.close();
});

test('keeps the previous opponent cell through local moves and updates it on the next opponent move', async () => {
  const first = activeState({ ...moveCoordinates });
  const result = await probe(first);
  const marker = result.lastMove;
  await result.update({ ...first, isP1Turn: true, tieFrom: { x: 4, y: 5 }, tieTo: { x: 4, y: 4 } });
  expect(result.lastMove).toBe(marker);
  await result.update({ ...first, tieFrom: { x: 2, y: 2 }, tieTo: { x: 3, y: 2 } });
  expect(result.lastMove).toEqual({ x: 3, y: 2 });
  await result.close();
});

test('clock publications and repeated tied weapon choices do not reset or move the marker', async () => {
  const state = activeState({ ...moveCoordinates, tiePending: true, attacker: Piece.Rock, defender: Piece.Rock });
  const result = await probe(state);
  const marker = result.lastMove;
  await result.update({ ...state, clock0Ms: 590000, playerChoice: Choice.Paper });
  expect(result.lastMove).toBe(marker);
  await result.update({ ...state, tieRound: 1, attacker: Piece.Scissors, defender: Piece.Scissors });
  expect(result.lastMove).toBe(marker);
  await result.close();
});

test.each([Piece.Trap, Piece.Paper])('marks the attacked cell even when the opponent loses against %s', async defender => {
  const result = await probe(activeState({ ...moveCoordinates, attacker: Piece.Rock, defender, outcome: -1 }));
  expect(result.lastMove).toEqual(moveCoordinates.tieTo);
  await result.close();
});

test('tracks a flag capture that finishes without switching turns but does not invent a restored finished move', async () => {
  const before = activeState({ isP1Turn: true });
  const result = await probe(before);
  const next = activeState({ ...moveCoordinates, isP1Turn: true, phase: Phase.Finished, defender: Piece.Flag, winner: 'bob' });
  next.owners[16] = Owner.P1;
  await result.update(next);
  expect(result.lastMove).toEqual(moveCoordinates.tieTo);
  await result.close();
  const restored = await probe(next);
  expect(restored.lastMove).toBeNull();
  await restored.close();
});

test('timeout does not create a new destination', async () => {
  const state = activeState({ ...moveCoordinates });
  const result = await probe(state);
  const marker = result.lastMove;
  await result.update({ ...state, phase: Phase.Finished, finishReason: 'timeout', winner: 'bob' });
  expect(result.lastMove).toBe(marker);
  await result.close();
});

test('clears history on room, participant, setup and missing-state changes', async () => {
  const state = activeState({ ...moveCoordinates });
  const result = await probe(state);
  await result.update(activeState({ gameId: 'deadbeef' }));
  expect(result.lastMove).toBeNull();
  await result.update(state);
  expect(result.lastMove).toEqual(moveCoordinates.tieTo);
  await result.update(state, Owner.P1);
  expect(result.lastMove).toBeNull();
  await result.update(state, Owner.None);
  expect(result.lastMove).toBeNull();
  await result.update({ ...state, phase: Phase.Joined });
  expect(result.lastMove).toBeNull();
  await result.update(state);
  await result.update(null);
  expect(result.lastMove).toBeNull();
  await result.close();
});

test.each([
  { tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 } },
  { tieFrom: { x: 2, y: 1 }, tieTo: { x: 3, y: 2 } },
  { tieFrom: { x: 6, y: 1 }, tieTo: { x: 7, y: 1 } },
  { tieFrom: { x: 2, y: -1 }, tieTo: { x: 2, y: 0 } },
  { tieFrom: { x: 1.5, y: 0 }, tieTo: { x: 2.5, y: 0 } },
])('does not highlight invalid or default move coordinates: %j', async coordinates => {
  const result = await probe(activeState(coordinates));
  expect(result.lastMove).toBeNull();
  await result.close();
});
