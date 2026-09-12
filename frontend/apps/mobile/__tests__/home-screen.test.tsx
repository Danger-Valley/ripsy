import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CELLS, Choice, Owner, Phase, Piece, type GameState } from '@rps/core';
import { HomeScreen } from '../src/screens/home-screen';
import { useNativeRipsyGame } from '../src/hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { usePushNotifications } from '../src/hooks/use-push-notifications';

jest.mock('../src/hooks/use-native-ripsy-game');
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-push-notifications');

const createGame = jest.fn(() => Promise.resolve('abcdef12'));
const listGames = jest.fn(() => Promise.resolve([] as GameState[]));
const navigate = jest.fn();
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

async function renderHome() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<HomeScreen navigation={{ navigate, addListener } as never} route={{} as never} />);
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
