import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Owner } from '@rps/core';
import { HomeScreen } from '../src/screens/home-screen';
import { useNativeRipsyGame } from '../src/hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { usePushNotifications } from '../src/hooks/use-push-notifications';

jest.mock('../src/hooks/use-native-ripsy-game');
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-push-notifications');

const createGame = jest.fn(() => Promise.resolve('abcdef12'));
const navigate = jest.fn();

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

  const openButton = renderer.root.find(node => node.props.accessibilityHint === 'Opens the entered game room');
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

async function renderHome() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<HomeScreen navigation={{ navigate } as never} route={{} as never} />);
  });
  return renderer;
}
