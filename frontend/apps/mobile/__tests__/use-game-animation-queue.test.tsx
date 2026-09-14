import React from 'react';
import { Animated } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Choice, Owner, Phase, Piece, toIdx, type GameState } from '@rps/core';
import { useGameAnimationQueue } from '../src/hooks/use-game-animation-queue';

type AnimationQueue = ReturnType<typeof useGameAnimationQueue>;

function Probe({ state, onRender }: { state: GameState; onRender: (animation: AnimationQueue) => void }) {
  onRender(useGameAnimationQueue(state));
  return null;
}

test('starts container movement once and only after the mounted Rive trigger reports ready', async () => {
  jest.useFakeTimers();
  const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    reset: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  }));
  const previous = activeState();
  const next: GameState = {
    ...previous,
    isP1Turn: true,
    owners: [...previous.owners],
    pieces: [...previous.pieces],
    tieFrom: { x: 0, y: 5 },
    tieTo: { x: 0, y: 4 },
  };
  next.owners[toIdx(0, 5)] = Owner.None;
  next.pieces[toIdx(0, 5)] = Piece.Empty;
  next.owners[toIdx(0, 4)] = Owner.P0;
  next.pieces[toIdx(0, 4)] = Piece.Rock;
  let animation!: AnimationQueue;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe state={previous} onRender={value => { animation = value; }} />);
  });
  await ReactTestRenderer.act(() => {
    renderer.update(<Probe state={next} onRender={value => { animation = value; }} />);
  });

  expect(animation.activeMove).toMatchObject({ from: { x: 0, y: 5 }, to: { x: 0, y: 4 } });
  expect(timing).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => {
    animation.startActiveMove();
    animation.startActiveMove();
  });

  expect(timing).toHaveBeenCalledTimes(1);
  expect(timing.mock.calls[0]?.[1]).toMatchObject({ duration: 750, toValue: 1, useNativeDriver: true });

  await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('delays board travel by 100 ms and shortens it to preserve the Rive landing time', async () => {
  jest.useFakeTimers();
  const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    reset: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  }));
  const previous = activeState();
  const next: GameState = {
    ...previous,
    isP1Turn: true,
    owners: [...previous.owners],
    pieces: [...previous.pieces],
    tieFrom: { x: 0, y: 5 },
    tieTo: { x: 0, y: 4 },
  };
  next.owners[toIdx(0, 5)] = Owner.None;
  next.pieces[toIdx(0, 5)] = Piece.Empty;
  next.owners[toIdx(0, 4)] = Owner.P0;
  next.pieces[toIdx(0, 4)] = Piece.Rock;
  let animation!: AnimationQueue;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe state={previous} onRender={value => { animation = value; }} />);
  });
  await ReactTestRenderer.act(() => {
    renderer.update(<Probe state={next} onRender={value => { animation = value; }} />);
  });
  await ReactTestRenderer.act(() => {
    animation.startActiveMove(100);
    jest.advanceTimersByTime(99);
  });
  expect(timing).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(timing).toHaveBeenCalledTimes(1);
  expect(timing.mock.calls[0]?.[1]).toMatchObject({ duration: 650, toValue: 1, useNativeDriver: true });

  await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('reveals both repeated tie weapons before making the picker state available again', async () => {
  jest.useFakeTimers();
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
    let completionTimer: ReturnType<typeof setTimeout> | null = null;
    return {
      reset: jest.fn(),
      start: callback => {
        completionTimer = setTimeout(() => callback?.({ finished: true }), config.duration);
      },
      stop: () => {
        if (completionTimer !== null) clearTimeout(completionTimer);
      },
    };
  });
  const previous = activeState();
  previous.owners[toIdx(0, 4)] = Owner.P1;
  previous.pieces[toIdx(0, 4)] = Piece.Rock;
  const tied: GameState = {
    ...previous,
    attacker: Piece.Rock,
    defender: Piece.Rock,
    isP1Turn: true,
    tiePending: true,
    tieRound: 0,
    tieFrom: { x: 0, y: 5 },
    tieTo: { x: 0, y: 4 },
  };
  let animation!: AnimationQueue;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe state={previous} onRender={value => { animation = value; }} />);
  });
  await ReactTestRenderer.act(() => {
    renderer.update(<Probe state={tied} onRender={value => { animation = value; }} />);
  });
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(621);
  });
  expect(animation.activeKind).toBeNull();
  expect(animation.combatPhase).toBe('hold');

  const waitingForOpponent: GameState = { ...tied, playerChoice: Choice.Rock };
  await ReactTestRenderer.act(() => {
    renderer.update(<Probe state={waitingForOpponent} onRender={value => { animation = value; }} />);
  });

  const repeatedTie: GameState = {
    ...tied,
    attacker: Piece.Paper,
    defender: Piece.Paper,
    playerChoice: Choice.None,
    tieRound: 1,
  };
  await ReactTestRenderer.act(() => {
    renderer.update(<Probe state={repeatedTie} onRender={value => { animation = value; }} />);
  });

  expect(animation.activeKind).toBe('battle');
  expect(animation.combatPhase).toBe('hold');
  expect(animation.activeCombat).toMatchObject({
    isRepeatedTie: true,
    attackerPiece: Piece.Paper,
    defenderPiece: Piece.Paper,
  });

  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(899);
  });
  expect(animation.activeKind).toBe('battle');

  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(animation.activeKind).toBeNull();
  expect(animation.displayedState?.tieRound).toBe(1);

  await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function activeState(): GameState {
  const owners: Owner[] = Array.from({ length: 49 }, () => Owner.None);
  const pieces: Piece[] = Array.from({ length: 49 }, () => Piece.Empty);
  owners[toIdx(0, 5)] = Owner.P0;
  pieces[toIdx(0, 5)] = Piece.Rock;
  return {
    gameId: 'animation-test',
    phase: Phase.Active,
    isP1Turn: false,
    owners,
    pieces,
    live0: 1,
    live1: 1,
    attacker: Piece.Empty,
    defender: Piece.Empty,
    outcome: 0,
    playerChoice: 0,
    tiePending: false,
    tieFrom: { x: 0, y: 0 },
    tieTo: { x: 0, y: 0 },
    p0: 'alice',
    p1: 'bob',
    winner: null,
  };
}
