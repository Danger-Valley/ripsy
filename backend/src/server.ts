import { createServer } from 'node:http';
import type { ClientAction, ClientMessage, ServerMessage } from '@rps/core';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';
import { SessionManager } from './session.js';

const port = Number(process.env.PORT ?? 8080);
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const gameTtlSeconds = Number(process.env.GAME_TTL_SECONDS ?? 60 * 60 * 24 * 7);
const keyPrefix = process.env.RIPSY_REDIS_PREFIX ?? 'ripsy';
const sessionTtlSeconds = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 30);
const configuredSessionSecret = process.env.SESSION_SECRET;
if (!configuredSessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET is required in production');
}
const sessionManager = new SessionManager(configuredSessionSecret ?? 'ripsy-local-development-secret-change-me', sessionTtlSeconds);
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:3100').split(',').map(value => value.trim()).filter(Boolean));

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
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.url === '/health') {
    const ready = await store.isReady();
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: ready, redis: ready ? 'connected' : 'unavailable' }));
    return;
  }
  if (requestUrl.pathname === '/session' && request.method === 'OPTIONS') {
    if (!applyCors(request.headers.origin, response)) return;
    response.writeHead(204).end();
    return;
  }
  if (requestUrl.pathname === '/session' && request.method === 'POST') {
    if (!applyCors(request.headers.origin, response)) return;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    try {
      const authorization = request.headers.authorization;
      const existingToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
      const playerId = existingToken ? sessionManager.verify(existingToken).playerId : undefined;
      response.writeHead(201).end(JSON.stringify(sessionManager.issue(playerId)));
    } catch (error) {
      response.writeHead(401).end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid session' }));
    }
    return;
  }
  response.writeHead(404).end();
});

const sockets = new WebSocketServer({ server, maxPayload: 16 * 1024 });
const responsiveSockets = new WeakSet<WebSocket>();
const heartbeatInterval = setInterval(() => {
  for (const socket of sockets.clients) {
    if (!responsiveSockets.has(socket)) {
      socket.terminate();
      continue;
    }
    responsiveSockets.delete(socket);
    socket.ping();
  }
}, 30_000);
heartbeatInterval.unref();

await subscriber.pSubscribe(store.eventPattern, (gameId) => {
  void broadcast(gameId);
});

sockets.on('connection', (socket) => {
  responsiveSockets.add(socket);
  socket.on('pong', () => responsiveSockets.add(socket));
  let playerId: string | null = null;
  const authenticationTimeout = setTimeout(() => socket.close(1008, 'Authentication timed out'), 10_000);

  socket.on('message', (data) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString()) as ClientMessage;
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
        throw new Error('Invalid request envelope');
      }
      if (message.type === 'authenticate') {
        if (playerId) throw new Error('Socket is already authenticated');
        playerId = sessionManager.verify(message.token).playerId;
        const playerSockets = clients.get(playerId) ?? new Set<WebSocket>();
        playerSockets.add(socket);
        clients.set(playerId, playerSockets);
        clearTimeout(authenticationTimeout);
        send(socket, { type: 'connected', playerId });
        return;
      }
      if (!playerId) throw new Error('Authenticate before sending game commands');
      if (typeof message.requestId !== 'string') throw new Error('Invalid request envelope');
      void handle(socket, playerId, message);
    } catch (error) {
      send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid request' });
      if (!playerId) socket.close(1008, 'Authentication failed');
    }
  });

  socket.on('close', () => {
    clearTimeout(authenticationTimeout);
    if (!playerId) return;
    const playerSockets = clients.get(playerId);
    if (!playerSockets) return;
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

function applyCors(origin: string | undefined, response: import('node:http').ServerResponse) {
  if (origin && !allowedOrigins.has(origin)) {
    response.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Origin is not allowed' }));
    return false;
  }
  if (origin) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-headers', 'authorization, content-type');
  response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  response.setHeader('vary', 'Origin');
  return true;
}

server.listen(port, '0.0.0.0', () => {
  console.log(`RIPSY backend listening on http://0.0.0.0:${port}`);
  console.log(`Redis state: ${redisUrl.replace(/:\/\/.*@/, '://***@')}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  clearInterval(heartbeatInterval);
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
