import { createServer } from 'node:http';
import { createClient } from 'redis';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';
import { SessionManager } from './session.js';
import { createBackendDiagnostics } from './diagnostics.js';
import {
  createFirebaseMessaging,
  PushNotifier,
  RedisPushInstallationStore,
} from './push-notifications.js';
import { attachGameWebSocketServer } from './game-websocket-server.js';
import { loadShopConfig } from './shop-config.js';
import { createShopChain } from './shop-chain.js';
import { ShopError, ShopService, type ShopRedis } from './shop-service.js';

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
const shopConfig = loadShopConfig(process.env);
const shop = new ShopService(commandClient as unknown as ShopRedis, shopConfig, createShopChain(shopConfig), keyPrefix);
diagnose({ level: 'info', event: pushNotifier.enabled ? 'push.enabled' : 'push.disabled' });
const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (requestUrl.pathname.startsWith('/shop/')) {
    if (!applyCors(request.headers.origin, response)) return;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    try {
      if (request.method === 'GET' && requestUrl.pathname === '/shop/catalog') {
        response.writeHead(200).end(JSON.stringify(shop.catalog()));
        return;
      }
      const playerId = verifyBearerSession(request.headers.authorization);
      if (request.method === 'POST' && requestUrl.pathname === '/shop/orders') {
        const result = await shop.create(playerId, await readJsonBody(request));
        response.writeHead(201).end(JSON.stringify(result));
        return;
      }
      const match = /^\/shop\/orders\/([a-f0-9]{64})(\/submit)?$/.exec(requestUrl.pathname);
      if (match && request.method === 'GET' && !match[2]) {
        const result = await shop.get(playerId, match[1]!);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (match && request.method === 'POST' && match[2]) {
        const body = await readJsonBody(request);
        const result = await shop.submit(playerId, match[1]!, body.transaction);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      response.writeHead(404).end(JSON.stringify({ error: 'Shop endpoint not found' }));
    } catch (error) {
      const status = error instanceof BodyTooLargeError ? 413 : error instanceof AuthenticationError ? 401 : error instanceof ShopError ? error.status : 503;
      response.writeHead(status).end(JSON.stringify({ error: error instanceof ShopError ? error.message : status === 503 ? 'The shop is temporarily unavailable. Try again shortly.' : error instanceof Error ? error.message : 'Invalid request' }));
    }
    return;
  }
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

const gameSockets = attachGameWebSocketServer({
  server,
  store,
  sessionManager,
  diagnose,
  sendPush: targets => pushNotifier.send(targets),
});

const clockInterval = setInterval(() => {
  void store.expireDueClocks().catch(() => diagnose({ level: 'error', event: 'clock.expiration_failed' }));
}, 500);
clockInterval.unref();

await subscriber.pSubscribe(store.eventPattern, (gameId) => {
  void gameSockets.broadcast(gameId);
});

function applyCors(origin: string | undefined, response: import('node:http').ServerResponse) {
  if (origin && !allowedOrigins.has(origin)) {
    response.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Origin is not allowed' }));
    return false;
  }
  if (origin) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-headers', 'authorization, content-type');
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
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
  gameSockets.close();
  clearInterval(clockInterval);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([subscriber.quit(), commandClient.quit()]);
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
