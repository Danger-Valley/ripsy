import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Choice, Owner, Phase, Piece, toIdx, type GameState } from '@rps/core';
import { RipsySocketClient, type ConnectionStatus } from '@rps/game-client/socket';
import { WebSocket } from 'ws';
import { createBackendDiagnostics } from './diagnostics.js';
import {
  chooseWeapon,
  createGameRecord,
  gameView,
  joinGame,
  movePiece,
  submitLineup,
  type GameRecord,
} from './game-engine.js';
import { attachGameWebSocketServer, type GameStore } from './game-websocket-server.js';
import { SessionManager } from './session.js';
import type { PushTarget } from './push-notifications.js';

const pieces = [
  ...Array(4).fill(Piece.Rock),
  ...Array(4).fill(Piece.Paper),
  ...Array(4).fill(Piece.Scissors),
  Piece.Flag,
  Piece.Trap,
] as Piece[];
const xs = Array.from({ length: 14 }, (_, index) => index % 7);
const aliceYs = Array.from({ length: 14 }, (_, index) => 5 + Math.floor(index / 7));
const bobYs = Array.from({ length: 14 }, (_, index) => Math.floor(index / 7));

test('two authenticated clients play through the real WebSocket transport and recover state', async (context) => {
  const server = createServer();
  const sessions = new SessionManager('integration-test-secret-at-least-32-characters');
  const store = new MemoryGameStore();
  const pushes: PushTarget[][] = [];
  const transport = attachGameWebSocketServer({
    server,
    store,
    sessionManager: sessions,
    diagnose: createBackendDiagnostics(() => undefined),
    heartbeatIntervalMs: 60_000,
    sendPush: async targets => { pushes.push(targets); },
  });
  store.onChange = gameId => { void transport.broadcast(gameId); };
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(async () => {
    transport.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const address = server.address() as AddressInfo;
  const endpoint = `ws://127.0.0.1:${address.port}`;
  const aliceSession = sessions.issue('alice');
  const bobSession = sessions.issue('bob');
  const alice = createClient(endpoint, aliceSession.playerId, aliceSession.token);
  const bob = createClient(endpoint, bobSession.playerId, bobSession.token);
  context.after(() => {
    alice.disconnect();
    bob.disconnect();
  });

  const aliceConnected = waitForStatus(alice, 'connected');
  alice.connect();
  await aliceConnected;
  const created = await alice.request({ type: 'createGame' });
  assert.equal(created.gameId, 'game-1');
  alice.setGameId(created.gameId);

  const aliceSaved = waitForState(alice, state => state.phase === Phase.LineupP0Set);
  const aliceFigures = [5, 4, 42, ...Array(11).fill(1)];
  await alice.request({ type: 'submitLineup', gameId: created.gameId!, xs, ys: aliceYs, pieces, figureVariants: aliceFigures });
  await aliceSaved;
  const listed = await alice.request({ type: 'listGames' });
  assert.deepEqual(listed.games?.map(game => game.gameId), ['game-1']);

  const bobConnected = waitForStatus(bob, 'connected');
  bob.connect(created.gameId);
  await bobConnected;
  await bob.request({ type: 'joinGame', gameId: created.gameId! });

  const aliceActive = waitForState(alice, state => state.phase === Phase.Active);
  const bobActive = waitForState(bob, state => state.phase === Phase.Active);
  const bobFigures = [3, 3, ...Array(12).fill(1)];
  await bob.request({ type: 'submitLineup', gameId: created.gameId!, xs, ys: bobYs, pieces, figureVariants: bobFigures });
  const [aliceState, bobState] = await Promise.all([aliceActive, bobActive]);

  assert.equal(aliceState.pieces[toIdx(0, 0)], Piece.Empty, 'Alice must not see Bob\'s hidden piece');
  assert.equal(bobState.pieces[toIdx(0, 5)], Piece.Empty, 'Bob must not see Alice\'s hidden piece');
  assert.equal(aliceState.owners[toIdx(0, 0)], Owner.P1);
  assert.equal(bobState.owners[toIdx(0, 5)], Owner.P0);
  assert.deepEqual(xs.map((x, index) => aliceState.figureVariants![toIdx(x, bobYs[index]!)]), bobFigures);
  assert.deepEqual(xs.map((x, index) => bobState.figureVariants![toIdx(x, aliceYs[index]!)]), aliceFigures);

  const bobTurn = waitForState(bob, state => state.phase === Phase.Active && state.isP1Turn);
  await alice.request({ type: 'movePiece', gameId: created.gameId!, fromX: 0, fromY: 5, toX: 0, toY: 4 });
  await bobTurn;
  assert.equal(pushes.at(-1)?.[0]?.playerId, bobSession.playerId);
  assert.equal(pushes.at(-1)?.[0]?.notification.event, 'turn');
  assert.equal(pushes.at(-1)?.[0]?.notification.gameId, created.gameId);
  const delivered = pushes.length;
  await assert.rejects(alice.request({ type: 'movePiece', gameId: created.gameId!, fromX: 0, fromY: 4, toX: 0, toY: 3 }));
  assert.equal(pushes.length, delivered, 'rejected moves do not send turn notifications');

  alice.suspend();
  const reconnected = waitForStatus(alice, 'connected');
  const recovered = waitForState(alice, state =>
    state.phase === Phase.Active &&
    state.isP1Turn &&
    state.owners[toIdx(0, 4)] === Owner.P0 &&
    state.pieces[toIdx(0, 4)] === Piece.Rock,
  );
  alice.connect(created.gameId);
  await reconnected;
  const recoveredState = await recovered;
  assert.equal(recoveredState.figureVariants![toIdx(0, 4)], 5, 'moving/reconnecting retains the exact original model');
  assert.deepEqual(xs.map((x, index) => recoveredState.figureVariants![toIdx(x, bobYs[index]!)]), bobFigures);
});

function createClient(endpoint: string, playerId: string, sessionToken: string) {
  return new RipsySocketClient({
    endpoint,
    playerId,
    sessionToken,
    reconnectBaseDelayMs: 5,
    reconnectMaxDelayMs: 10,
    requestTimeoutMs: 1_000,
    socketFactory: url => new WebSocket(url) as unknown as globalThis.WebSocket,
  });
}

function waitForStatus(client: RipsySocketClient, expected: ConnectionStatus) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${expected}`));
    }, 1_000);
    const unsubscribe = client.onStatus(status => {
      if (status !== expected) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

function waitForState(client: RipsySocketClient, predicate: (state: GameState) => boolean) {
  return new Promise<GameState>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for game state'));
    }, 1_000);
    const unsubscribe = client.onState(state => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    });
  });
}

class MemoryGameStore implements GameStore {
  private readonly games = new Map<string, GameRecord>();
  onChange: (gameId: string) => void = () => undefined;

  async create(playerId: string) {
    const game = createGameRecord('game-1', playerId);
    this.games.set(game.id, game);
    this.onChange(game.id);
    return gameView(game, playerId);
  }

  async get(gameId: string, playerId: string) {
    return gameView(this.record(gameId), playerId);
  }

  async list(playerId: string) {
    return [...this.games.values()]
      .filter(game => game.phase < Phase.Finished && (game.p0 === playerId || game.p1 === playerId))
      .map(game => gameView(game, playerId));
  }

  async join(gameId: string, playerId: string) {
    return this.mutate(gameId, playerId, game => joinGame(game, playerId));
  }

  async submitLineup(gameId: string, playerId: string, lineupXs: number[], lineupYs: number[], lineupPieces: number[], figureVariants?: number[]) {
    return this.mutate(gameId, playerId, game => submitLineup(game, playerId, lineupXs, lineupYs, lineupPieces, new Date(), figureVariants));
  }

  async move(gameId: string, playerId: string, fromX: number, fromY: number, toX: number, toY: number) {
    return this.mutate(gameId, playerId, game => movePiece(game, playerId, fromX, fromY, toX, toY));
  }

  async choose(gameId: string, playerId: string, choice: Choice) {
    return this.mutate(gameId, playerId, game => chooseWeapon(game, playerId, choice));
  }

  async views(gameId: string) {
    const game = this.record(gameId);
    return [game.p0, game.p1].filter(Boolean).map(playerId => ({ playerId, state: gameView(game, playerId) }));
  }

  private async mutate(gameId: string, playerId: string, mutation: (game: GameRecord) => void) {
    const game = this.record(gameId);
    mutation(game);
    this.onChange(gameId);
    return gameView(game, playerId);
  }

  private record(gameId: string) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');
    return game;
  }
}
