import React from 'react';
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: () => true }));
import { Animated, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import { Choice, FigureVariant, FinishReason, HEIGHT, Owner, Phase, Piece, WIDTH, type GameState } from '@rps/core';
import { ShopClient } from '@rps/game-client/shop';
import { GameBoard } from '../src/components/game-board';
import { VictoryFireworks } from '../src/components/victory-fireworks';
import { BattleResultPanel, WeaponChoiceModal } from '../src/components/battle-panels';
import { StatusBanner } from '../src/components/status-banner';
import { BattleStatus } from '../src/components/toy-battle-shell';
import { ComputerGameScreen, GameScreen } from '../src/screens/game-screen';
import { useGameAnimationQueue } from '../src/hooks/use-game-animation-queue';
import { useNativeRipsyGame } from '../src/hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';

jest.mock('../src/hooks/use-game-animation-queue');
jest.mock('../src/hooks/use-native-ripsy-game');
jest.mock('../src/hooks/use-player-identity');

let gameState: GameState;
let nativeGame: ReturnType<typeof useNativeRipsyGame>;
const submitLineup = jest.fn<Promise<{ type: 'result'; requestId: string }>, [number[], number[], number[], number[]?, Array<string | null>?]>(async (xs, ys, pieces, figureVariants) => {
  xs.forEach((x, index) => {
    const boardIndex = ys[index]! * WIDTH + x;
    gameState.owners[boardIndex] = Owner.P0;
    gameState.pieces[boardIndex] = pieces[index] as Piece;
    if (figureVariants) {
      gameState.figureVariants ??= Array(WIDTH * HEIGHT).fill(FigureVariant.Empty);
      gameState.figureVariants[boardIndex] = figureVariants[index] as FigureVariant;
    }
  });
  gameState.live0 = 14;
  gameState.phase = Phase.LineupP0Set;
  return { type: 'result', requestId: 'lineup' };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(ShopClient.prototype, 'inventory').mockRejectedValue(new Error('Offline test fixture'));
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
      activeTrap: null,
      activeTrapSequence: 0,
      isAnimating: false,
      progress,
      startActiveMove: jest.fn(),
      startActiveTrap: jest.fn(),
      startActiveAttack: jest.fn(),
      completeActiveMoveLanding: jest.fn(),
      opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.55, 1] }),
      scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.025, 1] }),
    };
  });
});
afterEach(() => jest.restoreAllMocks());

test('creator can shuffle, save, and see the lineup ready state before an opponent joins', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />,
    );
    await Promise.resolve();
  });

  expect(renderer.root.find(node => node.props.accessibilityHint === 'Opens the system share sheet')).toBeDefined();
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Waiting for opponent. The board is a preview. Use the controls below it to set your lineup.')).toBeDefined();
  expect(renderer.root.find(node => node.props.testID === 'lineup-controls')).toBeDefined();
  expect(renderer.root.find(node => node.props.testID === 'lineup-attention-glow')).toBeDefined();
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === 'Set your lineup')).toHaveLength(1);
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === 'The board is a preview, not an editor. Shuffle until it feels right, then save below.')).toHaveLength(1);
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
  const [xs, ys, pieces, figureVariants, figureAssetIds] = submitLineup.mock.calls[0]!;
  expect(xs).toHaveLength(14);
  expect(ys).toHaveLength(14);
  expect(new Set(ys)).toEqual(new Set([HEIGHT - 2, HEIGHT - 1]));
  expect(pieces.filter(piece => piece === Piece.Rock)).toHaveLength(4);
  expect(pieces.filter(piece => piece === Piece.Paper)).toHaveLength(4);
  expect(pieces.filter(piece => piece === Piece.Scissors)).toHaveLength(4);
  expect(pieces.filter(piece => piece === Piece.Flag)).toHaveLength(1);
  expect(pieces.filter(piece => piece === Piece.Trap)).toHaveLength(1);
  expect(figureVariants?.filter(variant => variant === FigureVariant.Fig1)).toHaveLength(14);
  expect(figureVariants?.filter(variant => variant === FigureVariant.Fig2)).toHaveLength(0);
  expect(figureAssetIds).toEqual(Array(14).fill(null));
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Lineup saved').length).toBeGreaterThan(0);
  expect(renderer.root.findAll(node => node.props.testID === 'lineup-attention-glow')).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.children === 'Saved! Battle starts when your opponent is ready. You can still shuffle before it begins.').length).toBeGreaterThan(0);

  const savedButton = renderer.root.find(node => node.props.accessibilityHint === 'Saves your current hidden lineup' && node.props.accessibilityState?.disabled);
  expect(savedButton.props.accessibilityState).toMatchObject({ disabled: true });

  const shuffleButton = renderer.root.find(node => node.props.accessibilityHint === 'Creates a different random hidden lineup');
  await ReactTestRenderer.act(() => {
    shuffleButton.props.onPress();
  });

  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Lineup saved')).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.testID === 'lineup-attention-glow').length).toBeGreaterThan(0);
  expect(renderer.root.findAll(node => node.props.children === 'New arrangement? Save your changes to use it.').length).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
});

test('shuffling keeps each paid figure paired with its exact Core asset ID', async () => {
  const firstAsset = 'Vote111111111111111111111111111111111111111';
  const secondAsset = 'SysvarC1ock11111111111111111111111111111111';
  const slots = Array<string | null>(14).fill(null);
  slots[2] = firstAsset;
  slots[9] = secondAsset;
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({
    username: 'ripsy-figure-loadout',
    password: JSON.stringify(slots),
    service: 'com.dangervalley.ripsy.figure-loadout',
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />,
    );
    await Promise.resolve();
  });
  const save = renderer.root.find(node => node.props.accessibilityHint === 'Saves your current hidden lineup');
  await ReactTestRenderer.act(async () => {
    save.props.onPress();
    await Promise.resolve();
  });

  const [, , , variants, assetIds] = submitLineup.mock.calls[0]!;
  expect(assetIds?.filter(Boolean).sort()).toEqual([firstAsset, secondAsset].sort());
  assetIds?.forEach((assetId, index) => {
    expect(variants?.[index]).toBe(assetId ? FigureVariant.Fig2 : FigureVariant.Fig1);
  });

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('offline computer battle skips waiting and starts after the local lineup is saved', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ComputerGameScreen navigation={{ replace: jest.fn() } as never} route={{} as never} />,
    );
    await Promise.resolve();
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
  expect(renderer.root.findAll(node => node.props.children === 'Your turn - select a piece').length).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test.each([
  [Phase.Active, null, undefined, false],
  [Phase.Finished, 'alice', FinishReason.Flag, true],
  [Phase.Finished, 'alice', FinishReason.Timeout, true],
  [Phase.Finished, 'bob', FinishReason.Flag, false],
  [Phase.Finished, null, FinishReason.LineupTimeout, false],
] as const)('fireworks only celebrate the local winner after gameplay presentation (%i, %s, %s)', async (phase, winner, reason, celebrates) => {
  gameState = { ...createdGame(), p1: 'bob', phase, winner, finishReason: reason };
  jest.mocked(useNativeRipsyGame).mockReturnValue({ ...nativeGame, gameState });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />);
  });
  expect(renderer.root.findByType(VictoryFireworks).props.victoryId).toBe(celebrates ? 'abcdef12:alice' : null);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('victory fireworks wait for the animation queue and also recognize player one', async () => {
  gameState = { ...createdGame(), p1: 'alice', p0: 'bob', phase: Phase.Finished, winner: 'alice', finishReason: FinishReason.Flag };
  jest.mocked(useNativeRipsyGame).mockReturnValue({ ...nativeGame, gameState, ownOwner: Owner.P1, isPlayer0: false, isPlayer1: true });
  const queued = jest.mocked(useGameAnimationQueue).getMockImplementation()!;
  let presenting = true;
  jest.mocked(useGameAnimationQueue).mockImplementation(state => ({ ...queued(state), isAnimating: presenting }));
  const render = () => <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(render()); });
  expect(renderer.root.findByType(VictoryFireworks).props.victoryId).toBeNull();
  presenting = false;
  await ReactTestRenderer.act(async () => renderer.update(render()));
  expect(renderer.root.findByType(VictoryFireworks).props.victoryId).toBe('abcdef12:alice');
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('keeps both clocks mounted after the game finishes', async () => {
  gameState = {
    ...createdGame(),
    phase: Phase.Finished,
    p1: 'bob',
    winner: 'alice',
    clock0Ms: 421_000,
    clock1Ms: 0,
    clockRunning: Owner.None,
    finishReason: 'timeout',
  };
  nativeGame = {
    ...nativeGame,
    gameState,
  };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />,
    );
    await Promise.resolve();
  });

  expect(renderer.root.find(node => node.props.testID === 'game-clocks')).toBeDefined();
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === '7:01')).toHaveLength(1);
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === '0:00')).toHaveLength(1);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test.each([
  [FinishReason.Timeout, 'bob', 'defeat', 'Time expired - you lost'],
  [FinishReason.Timeout, 'alice', 'victory', 'Victory - opponent ran out of time'],
  [FinishReason.Flag, 'bob', 'defeat', 'Game finished'],
  [FinishReason.LineupTimeout, null, 'cancelled', 'Game canceled - a lineup was not saved in time'],
] as const)('finished %s result takes precedence over an inactive-game error (%s)', async (finishReason, winner, outcome, message) => {
  gameState = { ...createdGame(), p1: 'bob', phase: Phase.Finished, finishReason, winner, clock0Ms: 0, clock1Ms: 119_000, clockRunning: Owner.None };
  jest.mocked(useNativeRipsyGame).mockReturnValue({ ...nativeGame, gameState, error: 'The game is not active' });
  const replace = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<GameScreen navigation={{ replace } as never} route={{ params: { gameId: 'abcdef12' } } as never} />);
  });
  expect(renderer.root.findAllByType(StatusBanner)).toHaveLength(0);
  expect(renderer.root.findByType(BattleStatus).props.message).toBe(message);
  expect(renderer.root.findByType(BattleResultPanel).props.outcome).toBe(outcome);
  expect(renderer.root.findByType(GameBoard).props.interactionEnabled).toBe(false);
  expect(renderer.root.find(node => node.props.testID === 'game-clocks')).toBeDefined();
  await ReactTestRenderer.act(() => renderer.root.findByType(BattleResultPanel).props.onBack());
  expect(replace).toHaveBeenCalledWith('Home');
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('inactive-game errors stay visible until a finished snapshot is confirmed', async () => {
  gameState = { ...createdGame(), p1: 'bob', phase: Phase.Active };
  nativeGame = { ...nativeGame, gameState, error: 'The game is not active' };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);
  const render = () => <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(render()); });
  expect(renderer.root.findByType(StatusBanner).props.message).toBe('The game is not active');
  nativeGame = { ...nativeGame, gameState: { ...gameState, phase: Phase.Finished, finishReason: FinishReason.Timeout, winner: 'bob' } };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);
  await ReactTestRenderer.act(async () => renderer.update(render()));
  expect(renderer.root.findAllByType(StatusBanner)).toHaveLength(0);
  expect(renderer.root.findByType(BattleResultPanel).props.outcome).toBe('defeat');
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('a move rejected after timeout does not add an error above the result', async () => {
  gameState = { ...createdGame(), p1: 'bob', phase: Phase.Active };
  gameState.owners[5 * WIDTH] = Owner.P0;
  gameState.pieces[5 * WIDTH] = Piece.Rock;
  let rejectMove!: (error: Error) => void;
  const movePiece = jest.fn(() => new Promise<never>((_resolve, reject) => { rejectMove = reject; }));
  nativeGame = { ...nativeGame, gameState, movePiece };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);
  const render = () => <GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(render()); });
  await ReactTestRenderer.act(() => renderer.root.findByType(GameBoard).props.onCellPress({ x: 0, y: 5 }));
  await ReactTestRenderer.act(() => renderer.root.findByType(GameBoard).props.onCellPress({ x: 0, y: 4 }));
  expect(movePiece).toHaveBeenCalledTimes(1);
  nativeGame = { ...nativeGame, gameState: { ...gameState, phase: Phase.Finished, finishReason: FinishReason.Timeout, winner: 'bob' } };
  jest.mocked(useNativeRipsyGame).mockReturnValue(nativeGame);
  await ReactTestRenderer.act(async () => renderer.update(render()));
  await ReactTestRenderer.act(async () => rejectMove(new Error('The game is not active')));
  expect(renderer.root.findAllByType(StatusBanner)).toHaveLength(0);
  expect(renderer.root.findByType(BattleResultPanel).props.outcome).toBe('defeat');
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('authoritative finish locks an older displayed board and weapon picker immediately', async () => {
  const displayedState: GameState = { ...createdGame(), p1: 'bob', phase: Phase.Active, tiePending: true, playerChoice: Choice.None };
  displayedState.owners[5 * WIDTH] = Owner.P0;
  displayedState.pieces[5 * WIDTH] = Piece.Rock;
  gameState = { ...displayedState, phase: Phase.Finished, tiePending: false, winner: 'bob', finishReason: FinishReason.Timeout };
  jest.mocked(useNativeRipsyGame).mockReturnValue({ ...nativeGame, gameState });
  const queued = jest.mocked(useGameAnimationQueue).getMockImplementation()!;
  jest.mocked(useGameAnimationQueue).mockImplementation(state => ({ ...queued(state), displayedState }));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />);
  });
  expect(renderer.root.findByType(GameBoard).props.interactionEnabled).toBe(false);
  expect(renderer.root.findByType(WeaponChoiceModal).props.isOpen).toBe(false);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(WeaponChoiceModal).props.onChoose(Choice.Rock);
    renderer.root.findByType(GameBoard).props.onCellPress({ x: 0, y: 5 });
  });
  expect(nativeGame.chooseWeapon).not.toHaveBeenCalled();
  expect(renderer.root.findByType(GameBoard).props.selected).toBeNull();
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('unrelated server failures remain visible on the result screen', async () => {
  gameState = { ...createdGame(), p1: 'bob', phase: Phase.Finished, finishReason: FinishReason.Timeout, winner: 'bob' };
  jest.mocked(useNativeRipsyGame).mockReturnValue({ ...nativeGame, gameState, error: 'Connection lost' });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />);
  });
  expect(renderer.root.findByType(StatusBanner).props.message).toBe('Connection lost');
  expect(renderer.root.findByType(BattleResultPanel).props.outcome).toBe('defeat');
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

test('offline cached BONK/Jup keep their identities through shuffle and submission', async () => {
  const bonk = 'Vote111111111111111111111111111111111111111';
  const jup = 'SysvarC1ock11111111111111111111111111111111';
  const slots = [bonk, jup, ...Array(12).fill(null)];
  jest.mocked(Keychain.getGenericPassword)
    .mockResolvedValueOnce({ username: 'ripsy-figure-loadout', password: JSON.stringify(slots), service: 'com.dangervalley.ripsy.figure-loadout', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH })
    .mockResolvedValueOnce({ username: 'ripsy-figure-variants', password: JSON.stringify({ [bonk]: 3, [jup]: 4 }), service: 'com.dangervalley.ripsy.figure-loadout.variants', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<GameScreen navigation={{ replace: jest.fn() } as never} route={{ params: { gameId: 'abcdef12' } } as never} />);
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityHint === 'Saves your current hidden lineup').props.onPress();
  });
  const [, , , variants, assetIds] = submitLineup.mock.calls[0]!;
  expect(assetIds?.filter(Boolean).sort()).toEqual([bonk, jup].sort());
  assetIds?.forEach((assetId, index) => expect(variants?.[index]).toBe(assetId === bonk ? 3 : assetId === jup ? 4 : 1));
  await ReactTestRenderer.act(() => renderer.unmount());
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
