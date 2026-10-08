import React from 'react';
import { Modal, StyleSheet, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CELLS, Choice, Owner, Phase, Piece, type GameState } from '@rps/core';
import { HomeScreen } from '../src/screens/home-screen';
import { useNativeRipsyGame } from '../src/hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { usePushNotifications } from '../src/hooks/use-push-notifications';
import { saveActiveGameId } from '../src/storage/active-game';
import { useSolanaWallet } from '../src/hooks/use-solana-wallet';
import { usePrivyWallet } from '../src/hooks/use-privy-wallet';

jest.mock('../src/hooks/use-native-ripsy-game');
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-push-notifications');
jest.mock('../src/hooks/use-solana-wallet');
jest.mock('../src/hooks/use-privy-wallet');
jest.mock('../src/storage/active-game', () => ({ saveActiveGameId: jest.fn(() => Promise.resolve()) }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

const createGame = jest.fn(() => Promise.resolve('abcdef12'));
const listGames = jest.fn(() => Promise.resolve([] as GameState[]));
const navigate = jest.fn();
const setParams = jest.fn();
const addListener = jest.fn(() => jest.fn());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSolanaWallet).mockReturnValue({ isSupported: false, address: null } as ReturnType<typeof useSolanaWallet>);
  jest.mocked(usePrivyWallet).mockReturnValue({ address: null, refresh: jest.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof usePrivyWallet>);
  createGame.mockReset().mockResolvedValue('abcdef12');
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

test('Register opens the in-app email sign-in directly without creating a game', async () => {
  const renderer = await renderHome();
  const registerButton = renderer.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Register');
  await ReactTestRenderer.act(() => registerButton.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Shop', { signIn: true });
  expect(createGame).not.toHaveBeenCalled();
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

test.each([true, false])('does not show a create spinner for background requests (connected: %s)', async isConnected => {
  jest.mocked(useNativeRipsyGame).mockReturnValue({
    ...jest.mocked(useNativeRipsyGame)('alice-player-id', 'alice-session-token'),
    isBusy: true,
    isConnected,
  });
  const renderer = await renderHome();
  const button = findCreateButton(renderer);

  expect(button.props.accessibilityState).toEqual({ disabled: !isConnected, busy: false });
  expect(button.findAll(node => node.props.accessibilityLabel === 'Loading')).toHaveLength(0);
  expect(createGame).not.toHaveBeenCalled();
});

test('shows loading only during creation and prevents duplicate taps before rendering', async () => {
  let resolveCreation!: (gameId: string) => void;
  createGame.mockImplementationOnce(() => new Promise(resolve => { resolveCreation = resolve; }));
  const renderer = await renderHome();
  const button = () => findCreateButton(renderer);

  await ReactTestRenderer.act(() => {
    const press = button().props.onPress;
    press();
    press();
  });
  expect(createGame).toHaveBeenCalledTimes(1);
  expect(button().props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(button().findAll(node => node.props.accessibilityLabel === 'Loading').length).toBeGreaterThan(0);
  expect(navigate).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { resolveCreation('created1'); });
  expect(navigate).toHaveBeenCalledWith('Game', { gameId: 'created1' });
  expect(button().props.accessibilityState).toEqual({ disabled: false, busy: false });
});

test('clears creation loading after failure and permits retry', async () => {
  createGame.mockRejectedValueOnce(new Error('Request timed out'));
  const renderer = await renderHome();
  const button = () => findCreateButton(renderer);

  await ReactTestRenderer.act(async () => { button().props.onPress(); });
  expect(navigate).not.toHaveBeenCalled();
  expect(button().props.accessibilityState).toEqual({ disabled: false, busy: false });

  await ReactTestRenderer.act(async () => { button().props.onPress(); });
  expect(createGame).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledWith('Game', { gameId: 'abcdef12' });
});

test.each(['identity', 'connection'])('guards creation when %s is not ready', async unavailable => {
  if (unavailable === 'identity') {
    jest.mocked(usePlayerIdentity).mockReturnValue({ playerId: '', sessionToken: '', isReady: false, error: null });
  } else {
    jest.mocked(useNativeRipsyGame).mockReturnValue({
      ...jest.mocked(useNativeRipsyGame)('alice-player-id', 'alice-session-token'),
      isConnected: false,
    });
  }
  const renderer = await renderHome();
  const button = findCreateButton(renderer);

  await ReactTestRenderer.act(async () => { button.props.onPress(); });
  expect(createGame).not.toHaveBeenCalled();
  expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
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
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'alert')).toHaveLength(0);
  expect(renderer.root.findAll(node => typeof node.props.children === 'string' && node.props.children.startsWith('Player '))).toHaveLength(0);
  await ReactTestRenderer.act(() => computerButton.props.onPress());
  expect(navigate).toHaveBeenCalledWith('ComputerGame');
});

test('renders the illustrated compact home with safe-area spacing', async () => {
  const renderer = await renderHome();

  expect(renderer.root.find(node => node.props.testID === 'arcade-home-hero')).toBeDefined();
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'RIPSY').length).toBeGreaterThan(0);
  expect(renderer.root.findAll(node => node.props.children === 'Create battle').length).toBeGreaterThan(0);
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Set up your army')).toBeDefined();
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Explore figure shop')).toBeDefined();
  expect(StyleSheet.flatten(renderer.root.find(node => node.props.testID === 'home-scroll').props.contentContainerStyle)).toMatchObject({
    paddingTop: 55,
    paddingBottom: 46,
  });
});

test.each([320, 375, 768, 1280])('keeps the replacement hero proportional inside the capped layout at %s pt', async width => {
  const native = jest.requireActual('react-native');
  const dimensions = jest.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height: 844, scale: 3, fontScale: 1 });
  try {
    const renderer = await renderHome();
    const hero = StyleSheet.flatten(renderer.root.findByProps({ testID: 'arcade-home-hero' }).props.style);
    expect(hero.height).toBe((Math.min(464, width - 32) + 32) * 2 / 3);
    const logo = renderer.root.find(node => node.props.accessibilityLabel === 'RIPSY');
    expect(StyleSheet.flatten(logo.props.style).height).toBe(84);
    expect(logo.props.resizeMode).toBe('contain');
  } finally {
    dimensions.mockRestore();
  }
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

test('keeps technical identity failures off the home screen and disables game creation', async () => {
  jest.mocked(usePlayerIdentity).mockReturnValue({
    playerId: '',
    sessionToken: '',
    isReady: false,
    error: 'Could not create a player session',
  });
  const renderer = await renderHome();
  const createButton = renderer.root.find(node => node.props.accessibilityHint === 'Creates a new room and opens it');

  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'alert')).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.children === 'Could not create a player session')).toHaveLength(0);
  expect(createButton.props.disabled).toBe(true);
});

test('shows unfinished games as compact battle cards and opens a selected room', async () => {
  const activeGame = createActiveGame();
  jest.mocked(useNativeRipsyGame).mockReturnValue({
    ...jest.mocked(useNativeRipsyGame)('alice-player-id', 'alice-session-token'),
    activeGames: [activeGame],
  });
  const renderer = await renderHome();
  const card = renderer.root.find(node => node.props.accessibilityLabel === 'Open room active12, Your turn');

  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'header').some(node => node.props.children === 'Active games')).toBe(true);
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

test('opens functional settings and returns to the army from there', async () => {
  const renderer = await renderHome();
  await ReactTestRenderer.act(() => renderer.root.find(node => node.props.accessibilityLabel === 'Open settings').props.onPress());
  expect(renderer.root.findByType(Modal).props.visible).toBe(true);
  await ReactTestRenderer.act(() => renderer.root.find(node => node.props.accessibilityLabel === 'Your army' && node.props.accessibilityRole === 'button').props.onPress());
  expect(navigate).toHaveBeenCalledWith('Army');
  expect(renderer.root.findByType(Modal).props.visible).toBe(false);
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

function findCreateButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityHint === 'Creates a new room and opens it');
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
