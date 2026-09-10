import { createServer } from 'node:http';
import {
  PROTOCOL_VERSION,
  ProtocolMessageError,
  ProtocolVersionError,
  parseClientMessage,
  type ClientAction,
  type ServerMessage,
} from '@rps/core';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';
import { SessionManager } from './session.js';
import { createBackendDiagnostics } from './diagnostics.js';
import {
  createFirebaseMessaging,
  PushNotifier,
  pushTargetsForAction,
  RedisPushInstallationStore,
} from './push-notifications.js';

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
const diagnose = createBackendDiagnostics();

const commandClient = createClient({ url: redisUrl });
const subscriber = commandClient.duplicate();
commandClient.on('error', () => diagnose({ level: 'error', event: 'redis.error', client: 'commands' }));
subscriber.on('error', () => diagnose({ level: 'error', event: 'redis.error', client: 'subscriber' }));

await Promise.all([commandClient.connect(), subscriber.connect()]);

const store = new RedisGameStore(commandClient as unknown as RedisCommands, {
  gameTtlSeconds,
  keyPrefix,
});
const pushStore = new RedisPushInstallationStore(
  commandClient as unknown as RedisCommands,
  Number(process.env.PUSH_INSTALLATION_TTL_SECONDS ?? 60 * 60 * 24 * 90),
  keyPrefix,
);
let firebaseMessaging: ReturnType<typeof createFirebaseMessaging> = null;
try {
  firebaseMessaging = createFirebaseMessaging(process.env);
} catch {
  diagnose({ level: 'error', event: 'push.configuration_invalid' });
}
const pushNotifier = new PushNotifier(pushStore, firebaseMessaging);
diagnose({ level: 'info', event: pushNotifier.enabled ? 'push.enabled' : 'push.disabled' });
const clients = new Map<string, Set<WebSocket>>();

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.url === '/health') {
    const ready = await store.isReady();
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      ok: ready,
      redis: ready ? 'connected' : 'unavailable',
      push: pushNotifier.enabled ? 'configured' : 'disabled',
    }));
    return;
  }
  if ((requestUrl.pathname === '/session' || requestUrl.pathname === '/push/installations') && request.method === 'OPTIONS') {
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
      diagnose({ level: 'info', event: 'session.issued', renewed: Boolean(existingToken) });
    } catch (error) {
      diagnose({ level: 'warn', event: 'session.rejected' });
      response.writeHead(401).end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid session' }));
    }
    return;
  }
  if (requestUrl.pathname === '/push/installations' && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!applyCors(request.headers.origin, response)) return;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    try {
      const playerId = verifyBearerSession(request.headers.authorization);
      const body = await readJsonBody(request);
      const fid = typeof body.fid === 'string' ? body.fid.trim() : '';
      if (!isValidFid(fid)) throw new Error('A valid Firebase installation ID is required');
      if (request.method === 'DELETE') {
        await pushStore.unregister(playerId, fid);
      } else {
        await pushStore.register(playerId, fid);
      }
      response.writeHead(204).end();
      diagnose({ level: 'info', event: request.method === 'DELETE' ? 'push.unregistered' : 'push.registered' });
    } catch (error) {
      const status = error instanceof BodyTooLargeError ? 413 : error instanceof AuthenticationError ? 401 : 400;
      diagnose({ level: 'warn', event: 'push.registration_rejected', status });
      response.writeHead(status).end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' }));
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
  diagnose({ level: 'info', event: 'socket.connected', openSockets: sockets.clients.size });
  responsiveSockets.add(socket);
  socket.on('pong', () => responsiveSockets.add(socket));
  let playerId: string | null = null;
  const authenticationTimeout = setTimeout(() => socket.close(1008, 'Authentication timed out'), 10_000);

  socket.on('message', (data) => {
    try {
      const message = parseClientMessage(JSON.parse(data.toString()) as unknown);
      if (message.type === 'authenticate') {
        if (playerId) throw new Error('Socket is already authenticated');
        playerId = sessionManager.verify(message.token).playerId;
        const playerSockets = clients.get(playerId) ?? new Set<WebSocket>();
        playerSockets.add(socket);
        clients.set(playerId, playerSockets);
        clearTimeout(authenticationTimeout);
        send(socket, { type: 'connected', playerId, protocolVersion: PROTOCOL_VERSION });
        diagnose({ level: 'info', event: 'socket.authenticated', openSockets: sockets.clients.size });
        return;
      }
      if (!playerId) throw new Error('Authenticate before sending game commands');
      void handle(socket, playerId, message);
    } catch (error) {
      if (error instanceof ProtocolVersionError) {
        diagnose({ level: 'warn', event: 'socket.rejected', code: 'protocol_version' });
        send(socket, {
          type: 'error',
          code: 'UNSUPPORTED_PROTOCOL_VERSION',
          message: error.message,
          expectedProtocolVersion: error.expectedVersion,
          receivedProtocolVersion: error.receivedVersion,
        });
        socket.close(1002, 'Unsupported protocol version');
        return;
      }
      const isInvalidMessage = error instanceof ProtocolMessageError || error instanceof SyntaxError;
      diagnose({ level: 'warn', event: 'socket.rejected', code: isInvalidMessage ? 'invalid_message' : 'authentication' });
      send(socket, {
        type: 'error',
        code: isInvalidMessage ? 'INVALID_MESSAGE' : 'AUTHENTICATION_FAILED',
        message: error instanceof Error ? error.message : 'Invalid request',
      });
      if (!playerId) socket.close(1008, 'Authentication failed');
    }
  });

  socket.on('close', (code) => {
    clearTimeout(authenticationTimeout);
    diagnose({ level: 'info', event: 'socket.closed', code, authenticated: Boolean(playerId), openSockets: sockets.clients.size });
    if (!playerId) return;
    const playerSockets = clients.get(playerId);
    if (!playerSockets) return;
    playerSockets.delete(socket);
    if (playerSockets.size === 0) clients.delete(playerId);
  });
});

async function handle(socket: WebSocket, playerId: string, action: ClientAction) {
  const startedAt = Date.now();
  try {
    let gameId: string;
    let state;
    switch (action.type) {
      case 'createGame':
        state = await store.create(playerId);
        gameId = state.gameId;
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
    diagnose({ level: 'info', event: 'command.completed', action: action.type, durationMs: Date.now() - startedAt, outcome: 'success' });
    const pushTargets = pushTargetsForAction(action.type, state, playerId);
    if (pushTargets.length > 0) {
      void pushNotifier.send(pushTargets)
        .then(() => diagnose({ level: 'info', event: 'push.completed', recipients: pushTargets.length }))
        .catch(() => diagnose({ level: 'error', event: 'push.failed', recipients: pushTargets.length }));
    }
  } catch (error) {
    diagnose({ level: 'info', event: 'command.completed', action: action.type, durationMs: Date.now() - startedAt, outcome: 'failure' });
    send(socket, {
      type: 'error',
      code: 'REQUEST_FAILED',
      requestId: action.requestId,
      message: error instanceof Error ? error.message : 'Request failed',
    });
  }
}

async function broadcast(gameId: string) {
  const startedAt = Date.now();
  try {
    let recipients = 0;
    for (const { playerId, state } of await store.views(gameId)) {
      for (const socket of clients.get(playerId) ?? []) {
        send(socket, { type: 'state', gameId, state });
        recipients += 1;
      }
    }
    diagnose({ level: 'info', event: 'broadcast.completed', durationMs: Date.now() - startedAt, recipients });
  } catch {
    diagnose({ level: 'error', event: 'broadcast.failed', durationMs: Date.now() - startedAt });
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
  response.setHeader('access-control-allow-methods', 'POST, DELETE, OPTIONS');
  response.setHeader('vary', 'Origin');
  return true;
}

function verifyBearerSession(authorization: string | undefined) {
  try {
    if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication is required');
    return sessionManager.verify(authorization.slice(7)).playerId;
  } catch {
    throw new AuthenticationError();
  }
}

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 4 * 1024) throw new BodyTooLargeError();
    chunks.push(buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A JSON object is required');
  return value as Record<string, unknown>;
}

function isValidFid(value: string) {
  return value.length >= 10 && value.length <= 256 && /^[A-Za-z0-9_:-]+$/.test(value);
}

class BodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
  }
}

class AuthenticationError extends Error {
  constructor() {
    super('Authentication is required');
  }
}

server.listen(port, '0.0.0.0', () => {
  diagnose({ level: 'info', event: 'server.started', port });
});

async function shutdown(signal: string) {
  diagnose({ level: 'info', event: 'server.shutdown', signal });
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
