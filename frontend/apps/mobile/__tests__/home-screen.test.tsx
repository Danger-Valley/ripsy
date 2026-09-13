import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CELLS, Choice, Owner, Phase, Piece, type GameState } from '@rps/core';
import { HomeScreen } from '../src/screens/home-screen';
import { useNativeRipsyGame } from '../src/hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { usePushNotifications } from '../src/hooks/use-push-notifications';
import { saveActiveGameId } from '../src/storage/active-game';

jest.mock('../src/hooks/use-native-ripsy-game');
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-push-notifications');
jest.mock('../src/storage/active-game', () => ({ saveActiveGameId: jest.fn(() => Promise.resolve()) }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

const createGame = jest.fn(() => Promise.resolve('abcdef12'));
const listGames = jest.fn(() => Promise.resolve([] as GameState[]));
const navigate = jest.fn();
const setParams = jest.fn();
const addListener = jest.fn(() => jest.fn());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePlayerIdentity).mockReturnValue({
    playerId: 'alice-player-id',
    sessionToken: 'alice-session-token',
    isReady: true,
    error: null,
  });
  jest.mocked(useNativeRipsyGame).mockReturnValue({
    gameState: null,
    status: 'connected',
    error: null,
    isBusy: false,
    isConnected: true,
    isPlayer0: false,
    isPlayer1: false,
    ownOwner: Owner.None,
    isMyTurn: false,
    activeGames: [],
    listGames,
    createGame,
    refresh: jest.fn(() => Promise.resolve(null)),
    joinGame: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'join' })),
    submitLineup: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'lineup' })),
    movePiece: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'move' })),
    chooseWeapon: jest.fn(() => Promise.resolve({ type: 'result', requestId: 'choice' })),
  });
  jest.mocked(usePushNotifications).mockReturnValue({
    status: 'enabled',
    enable: jest.fn(() => Promise.resolve()),
  });
});

test('creates a game and opens the returned room', async () => {
  const renderer = await renderHome();
  const createButton = renderer.root.find(node => node.props.accessibilityHint === 'Creates a new room and opens it');

  await ReactTestRenderer.act(async () => {
    createButton.props.onPress();
    await createGame.mock.results[0]?.value;
  });

  expect(createGame).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('Game', { gameId: 'abcdef12' });
});

test('opens a fully local computer battle without waiting for the server', async () => {
  jest.mocked(useNativeRipsyGame).mockReturnValue({
    ...jest.mocked(useNativeRipsyGame)('alice-player-id', 'alice-session-token'),
    status: 'closed',
    isConnected: false,
    error: 'Server unavailable',
  });
  const renderer = await renderHome();
  const computerButton = renderer.root.find(node => node.props.accessibilityHint === 'Starts a completely offline battle against the computer');

  expect(computerButton.props.accessibilityState?.disabled).not.toBe(true);
  await ReactTestRenderer.act(() => computerButton.props.onPress());
  expect(navigate).toHaveBeenCalledWith('ComputerGame');
});

test('normalizes a pasted invitation and opens the room', async () => {
  const renderer = await renderHome();
  const input = renderer.root.findByType(TextInput);

  await ReactTestRenderer.act(() => {
    input.props.onChangeText('https://www.ripsy.fun/game/ABCDEF12');
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe('abcdef12');

  const openButton = renderer.root.find(node => node.props.accessibilityHint === 'Joins the entered battle automatically');
  await ReactTestRenderer.act(() => openButton.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Game', { gameId: 'abcdef12' });
});

test('shows identity failures as an alert and keeps game creation disabled', async () => {
  jest.mocked(usePlayerIdentity).mockReturnValue({
    playerId: '',
    sessionToken: '',
    isReady: false,
    error: 'Could not create a player session',
  });
  const renderer = await renderHome();
  const alert = renderer.root.find(node => node.props.accessibilityRole === 'alert');
  const createButton = renderer.root.find(node => node.props.accessibilityHint === 'Creates a new room and opens it');

  expect(alert.findByType('Text' as never).props.children).toBe('Could not create a player session');
  expect(createButton.props.disabled).toBe(true);
});

test('shows unfinished games as board previews and opens a selected room', async () => {
  const activeGame = createActiveGame();
  jest.mocked(useNativeRipsyGame).mockReturnValue({
    ...jest.mocked(useNativeRipsyGame)('alice-player-id', 'alice-session-token'),
    activeGames: [activeGame],
  });
  const renderer = await renderHome();
  const card = renderer.root.find(node => node.props.accessibilityLabel === 'Open room active12, Your turn');

  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'header').some(node => node.props.children === 'Your active games')).toBe(true);
  await ReactTestRenderer.act(() => card.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Game', { gameId: 'active12' });
});

test('shows multiple active games in a compact snapping carousel', async () => {
  const games = ['active12', 'active34', 'active56'].map(gameId => ({ ...createActiveGame(), gameId }));
  jest.mocked(useNativeRipsyGame).mockReturnValue({
    ...jest.mocked(useNativeRipsyGame)('alice-player-id', 'alice-session-token'),
    activeGames: games,
  });
  const renderer = await renderHome();
  const carousel = renderer.root.find(node => node.props.testID === 'active-games-carousel');

  expect(carousel.props.horizontal).toBe(true);
  expect(carousel.props.snapToInterval).toBeGreaterThan(260);
  expect(carousel.props.showsHorizontalScrollIndicator).toBe(false);
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Game 1 of 3')).toBeDefined();

  await ReactTestRenderer.act(() => carousel.props.onMomentumScrollEnd({
    nativeEvent: { contentOffset: { x: carousel.props.snapToInterval, y: 0 } },
  }));
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Game 2 of 3')).toBeDefined();
});

test('restores the last game only after the server confirms it is unfinished', async () => {
  const activeGame = createActiveGame();
  listGames.mockResolvedValueOnce([activeGame]);

  await renderHome({ restoreGameId: activeGame.gameId });

  expect(listGames).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('Game', { gameId: activeGame.gameId });
  expect(saveActiveGameId).not.toHaveBeenCalledWith(null);
});

test('does not restore a finished game and clears its saved id', async () => {
  const finishedGame = { ...createActiveGame(), phase: Phase.Finished };
  listGames.mockResolvedValueOnce([finishedGame]);

  await renderHome({ restoreGameId: finishedGame.gameId });

  expect(navigate).not.toHaveBeenCalledWith('Game', { gameId: finishedGame.gameId });
  expect(saveActiveGameId).toHaveBeenCalledWith(null);
});

async function renderHome(params?: { restoreGameId?: string }) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<HomeScreen navigation={{ navigate, addListener, setParams } as never} route={{ params } as never} />);
    await Promise.resolve();
  });
  return renderer;
}

function createActiveGame(): GameState {
  const owners = Array<Owner>(CELLS).fill(Owner.None);
  const pieces = Array<Piece>(CELLS).fill(Piece.Empty);
  owners[35] = Owner.P0;
  pieces[35] = Piece.Rock;
  owners[0] = Owner.P1;
  return {
    gameId: 'active12', phase: Phase.Active, p0: 'alice-player-id', p1: 'bob', isP1Turn: false,
    owners, pieces, live0: 1, live1: 1, attacker: Piece.Empty, defender: Piece.Empty, outcome: 0,
    playerChoice: Choice.None, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  };
}
