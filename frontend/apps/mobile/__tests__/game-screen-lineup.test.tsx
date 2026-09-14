import React from 'react';
import { Animated } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { HEIGHT, Owner, Phase, Piece, WIDTH, type GameState } from '@rps/core';
import { GameBoard } from '../src/components/game-board';
import { ComputerGameScreen, GameScreen } from '../src/screens/game-screen';
import { useGameAnimationQueue } from '../src/hooks/use-game-animation-queue';
import { useNativeRipsyGame } from '../src/hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';

jest.mock('../src/hooks/use-game-animation-queue');
jest.mock('../src/hooks/use-native-ripsy-game');
jest.mock('../src/hooks/use-player-identity');

let gameState: GameState;
let nativeGame: ReturnType<typeof useNativeRipsyGame>;
const submitLineup = jest.fn<Promise<{ type: 'result'; requestId: string }>, [number[], number[], number[]]>(async (xs, ys, pieces) => {
  xs.forEach((x, index) => {
    const boardIndex = ys[index]! * WIDTH + x;
    gameState.owners[boardIndex] = Owner.P0;
    gameState.pieces[boardIndex] = pieces[index] as Piece;
  });
  gameState.live0 = 14;
  gameState.phase = Phase.LineupP0Set;
  return { type: 'result', requestId: 'lineup' };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePlayerIdentity).mockReturnValue({
    playerId: 'alice',
    sessionToken: 'token',
    isReady: true,
    error: null,
  });
  gameState = createdGame();
  nativeGame = {
    gameState,
    status: 'connected',
    error: null,
    isBusy: false,
    isConnected: true,
    isPlayer0: true,
    isPlayer1: false,
    ownOwner: Owner.P0,
    isMyTurn: true,
    activeGames: [],
    listGames: jest.fn(() => Promise.resolve([])),
    createGame: jest.fn(() => Promise.resolve('abcdef12')),
    refresh: jest.fn(() => Promise.resolve(gameState)),
    joinGame: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'join' })),
    submitLineup,
    movePiece: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'move' })),
    chooseWeapon: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'choice' })),
  };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);
  jest.mocked(useGameAnimationQueue).mockImplementation(state => {
    const progress = new Animated.Value(0);
    return {
      displayedState: state,
      activeKind: null,
      activeMove: null,
      activeCombat: null,
      combatPhase: null,
      isAnimating: false,
      progress,
      startActiveMove: jest.fn(),
      completeActiveMoveLanding: jest.fn(),
      opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.55, 1] }),
      scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.025, 1] }),
    };
  });
});

test('creator can shuffle, save, and see the lineup ready state before an opponent joins', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />,
    );
  });

  expect(renderer.root.find(node => node.props.accessibilityHint === 'Opens the system share sheet')).toBeDefined();
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Waiting for opponent. Your lineup stays editable until the battle begins.')).toBeDefined();
  expect(renderer.root.find(node => node.props.testID === 'lineup-controls')).toBeDefined();
  expect(renderer.root.find(node => node.props.testID === 'lineup-countdown')).toBeDefined();
  expect(renderer.root.find(node => node.props.accessibilityHint === 'Creates a different random hidden lineup')).toBeDefined();
  expect(renderer.root.findByType(GameBoard).props.interactionEnabled).toBe(false);
  expect(renderer.root.findAll(node => node.props.children === 'Your pieces')).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.children === 'Opponent')).toHaveLength(0);
  const save = renderer.root.find(node => node.props.accessibilityHint === 'Saves your current hidden lineup');

  await ReactTestRenderer.act(async () => {
    save.props.onPress();
    await Promise.resolve();
  });

  expect(submitLineup).toHaveBeenCalledTimes(1);
  const [xs, ys, pieces] = submitLineup.mock.calls[0]!;
  expect(xs).toHaveLength(14);
  expect(ys).toHaveLength(14);
  expect(new Set(ys)).toEqual(new Set([HEIGHT - 2, HEIGHT - 1]));
  expect(pieces.filter(piece => piece === Piece.Rock)).toHaveLength(4);
  expect(pieces.filter(piece => piece === Piece.Paper)).toHaveLength(4);
  expect(pieces.filter(piece => piece === Piece.Scissors)).toHaveLength(4);
  expect(pieces.filter(piece => piece === Piece.Flag)).toHaveLength(1);
  expect(pieces.filter(piece => piece === Piece.Trap)).toHaveLength(1);
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Lineup saved')).toBeDefined();
  expect(renderer.root.findAll(node => node.props.children === 'Saved. The battle starts automatically when your opponent is ready.').length).toBeGreaterThan(0);

  const savedButton = renderer.root.find(node => node.props.accessibilityHint === 'Saves your current hidden lineup' && node.props.accessibilityState?.disabled);
  expect(savedButton.props.accessibilityState).toMatchObject({ disabled: true });

  const shuffleButton = renderer.root.find(node => node.props.accessibilityHint === 'Creates a different random hidden lineup');
  await ReactTestRenderer.act(() => {
    shuffleButton.props.onPress();
  });

  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Lineup saved')).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.children === 'Lineup changed. Save it when you are ready.').length).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
});

test('offline computer battle skips waiting and starts after the local lineup is saved', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <ComputerGameScreen navigation={{ replace: jest.fn() } as never} route={{} as never} />,
    );
  });

  expect(renderer.root.findAll(node => node.props.accessibilityHint === 'Opens the system share sheet')).toHaveLength(0);
  expect(renderer.root.find(node => node.props.testID === 'lineup-controls')).toBeDefined();
  const save = renderer.root.find(node => node.props.accessibilityHint === 'Saves your current hidden lineup');

  await ReactTestRenderer.act(async () => {
    save.props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findAll(node => node.props.testID === 'lineup-controls')).toHaveLength(0);
  expect(renderer.root.findByType(GameBoard).props.interactionEnabled).toBe(true);
  expect(renderer.root.findAll(node => node.props.children === 'Your turn — select a piece').length).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('an open room is joined automatically before showing the board and lineup', async () => {
  gameState = { ...createdGame(), p0: 'bob' };
  const joinGame = jest.fn(() => Promise.resolve({ type: 'result' as const, requestId: 'join' }));
  nativeGame = {
    ...nativeGame,
    gameState,
    isPlayer0: false,
    isMyTurn: false,
    ownOwner: Owner.None,
    joinGame,
  };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />,
    );
    await Promise.resolve();
  });

  expect(joinGame).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(GameBoard)).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.children === 'Join this game')).toHaveLength(0);

  gameState = { ...gameState, p1: 'alice', phase: Phase.Joined };
  nativeGame = {
    ...nativeGame,
    gameState,
    isPlayer1: true,
    ownOwner: Owner.P1,
  };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);

  await ReactTestRenderer.act(() => {
    renderer.update(
      <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />,
    );
  });

  expect(renderer.root.findByType(GameBoard)).toBeDefined();
  expect(renderer.root.find(node => node.props.testID === 'lineup-controls')).toBeDefined();

  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
});

function createdGame(): GameState {
  return {
    gameId: 'abcdef12',
    phase: Phase.Created,
    p0: 'alice',
    p1: '',
    isP1Turn: false,
    owners: Array.from({ length: WIDTH * HEIGHT }, () => Owner.None),
    pieces: Array.from({ length: WIDTH * HEIGHT }, () => Piece.Empty),
    live0: 0,
    live1: 0,
    attacker: Piece.Empty,
    defender: Piece.Empty,
    outcome: 0,
    playerChoice: 0,
    tiePending: false,
    tieFrom: { x: 0, y: 0 },
    tieTo: { x: 0, y: 0 },
    winner: null,
    lineupDeadlineAt: Date.now() + 180_000,
  };
}
