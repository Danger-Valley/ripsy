import { createServer } from 'node:http';
import type { ClientAction, ServerMessage } from '@rps/core';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';

const port = Number(process.env.PORT ?? 8080);
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const gameTtlSeconds = Number(process.env.GAME_TTL_SECONDS ?? 60 * 60 * 24 * 7);
const keyPrefix = process.env.RIPSY_REDIS_PREFIX ?? 'ripsy';

const commandClient = createClient({ url: redisUrl });
const subscriber = commandClient.duplicate();
commandClient.on('error', (error) => console.error('[redis:commands]', error));
subscriber.on('error', (error) => console.error('[redis:subscriber]', error));

await Promise.all([commandClient.connect(), subscriber.connect()]);

const store = new RedisGameStore(commandClient as unknown as RedisCommands, {
  gameTtlSeconds,
  keyPrefix,
});
const clients = new Map<string, Set<WebSocket>>();

const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    const ready = await store.isReady();
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: ready, redis: ready ? 'connected' : 'unavailable' }));
    return;
  }
  response.writeHead(404).end();
});

const sockets = new WebSocketServer({ server, maxPayload: 16 * 1024 });

await subscriber.pSubscribe(store.eventPattern, (gameId) => {
  void broadcast(gameId);
});

sockets.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const playerId = url.searchParams.get('playerId')?.trim();
  if (!playerId || playerId.length > 100) {
    socket.close(1008, 'A valid playerId is required');
    return;
  }
  const playerSockets = clients.get(playerId) ?? new Set<WebSocket>();
  playerSockets.add(socket);
  clients.set(playerId, playerSockets);
  send(socket, { type: 'connected', playerId });

  socket.on('message', (data) => {
    let action: ClientAction;
    try {
      action = JSON.parse(data.toString()) as ClientAction;
      if (!action || typeof action !== 'object' || typeof action.type !== 'string' || typeof action.requestId !== 'string') {
        throw new Error('Invalid request envelope');
      }
      void handle(socket, playerId, action);
    } catch (error) {
      send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  socket.on('close', () => {
    playerSockets.delete(socket);
    if (playerSockets.size === 0) clients.delete(playerId);
  });
});

async function handle(socket: WebSocket, playerId: string, action: ClientAction) {
  try {
    let gameId: string;
    let state;
    switch (action.type) {
      case 'createGame':
        state = await store.create(playerId);
        gameId = state.gamePda;
        break;
      case 'getGame':
        gameId = action.gameId;
        state = await store.get(gameId, playerId);
        break;
      case 'joinGame':
        gameId = action.gameId;
        state = await store.join(gameId, playerId);
        break;
      case 'submitLineup':
        gameId = action.gameId;
        state = await store.submitLineup(gameId, playerId, action.xs, action.ys, action.pieces);
        break;
      case 'movePiece':
        gameId = action.gameId;
        state = await store.move(gameId, playerId, action.fromX, action.fromY, action.toX, action.toY);
        break;
      case 'chooseWeapon':
        gameId = action.gameId;
        state = await store.choose(gameId, playerId, action.choice);
        break;
      default:
        throw new Error('Unknown action');
    }
    send(socket, { type: 'result', requestId: action.requestId, gameId, state });
  } catch (error) {
    send(socket, {
      type: 'error',
      requestId: action.requestId,
      message: error instanceof Error ? error.message : 'Request failed',
    });
  }
}

async function broadcast(gameId: string) {
  try {
    for (const { playerId, state } of await store.views(gameId)) {
      for (const socket of clients.get(playerId) ?? []) {
        send(socket, { type: 'state', gameId, state });
      }
    }
  } catch (error) {
    console.error(`[broadcast:${gameId}]`, error);
  }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

server.listen(port, '0.0.0.0', () => {
  console.log(`RIPSY backend listening on http://0.0.0.0:${port}`);
  console.log(`Redis state: ${redisUrl.replace(/:\/\/.*@/, '://***@')}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  for (const playerSockets of clients.values()) {
    for (const socket of playerSockets) socket.close(1001, 'Server shutting down');
  }
  sockets.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([subscriber.quit(), commandClient.quit()]);
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
