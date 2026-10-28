import { createServer } from 'node:http';
import { createClient } from 'redis';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';
import { SessionManager } from './session.js';
import { sendJson } from './http-json.js';
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
import { handleShopReconciliation } from './shop-reconciliation-http.js';
import { createSeekerTokenChecker, SeekerVerificationService } from './seeker-verification.js';
import { createFigureAssetSource, FigureInventoryService } from './figure-inventory.js';
import { WalletVerificationService } from './wallet-verification.js';
import { createPackChain } from './pack-chain.js';
import { figureManifest } from './figure-resources.js';
import { BackendPackService } from './backend-pack-service.js';
import { BackendPackSettingsService } from './backend-pack-settings.js';
import { createBackendPackChain } from './backend-pack-chain.js';
import { loadMobileUpdatePolicy, sendMobileUpdatePolicy } from './mobile-update-policy.js';
import { ShopPricingService } from './shop-pricing.js';
import { ShopAdminAuth } from './shop-admin-auth.js';
import { ShopAdminService } from './shop-admin.js';
import { ShopUsdRatesService } from './shop-usd-rates.js';
import { createPackAdminChain } from './pack-admin-chain.js';
import { handleShopAdmin } from './shop-admin-http.js';
import { readAppRequestMetadata, apiRouteFamily } from './app-request-metadata.js';

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
const mobileUpdatePolicy = loadMobileUpdatePolicy(process.env);

const commandClient = createClient({ url: redisUrl });
const subscriber = commandClient.duplicate();
commandClient.on('error', () => diagnose({ level: 'error', event: 'redis.error', client: 'commands' }));
subscriber.on('error', () => diagnose({ level: 'error', event: 'redis.error', client: 'subscriber' }));

await Promise.all([commandClient.connect(), subscriber.connect()]);

const shopConfig = loadShopConfig(process.env);
const walletVerification = new WalletVerificationService(commandClient as unknown as ShopRedis, shopConfig.publicOrigin, keyPrefix);
const figureInventory = new FigureInventoryService(
  commandClient as unknown as ShopRedis,
  walletVerification,
  // Core ownership must be read from the same cluster that minted the assets.
  // The separate Seeker RPC always targets mainnet because SGT lives there,
  // even while the figure shop itself is exercised on devnet.
  createFigureAssetSource(shopConfig.rpcUrl, shopConfig.collection, shopConfig.publicOrigin),
  keyPrefix,
);
const store = new RedisGameStore(commandClient as unknown as RedisCommands, {
  gameTtlSeconds,
  keyPrefix,
  validateFigureLineup: (playerId, variants, assetIds) => figureInventory.validateLineup(playerId, variants, assetIds),
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
const seekerVerification = new SeekerVerificationService(commandClient as unknown as ShopRedis, createSeekerTokenChecker(shopConfig.seekerRpcUrl), shopConfig.publicOrigin, keyPrefix);
const pricing = new ShopPricingService(commandClient as unknown as ShopRedis, shopConfig, keyPrefix);
const adminAuth = new ShopAdminAuth(commandClient as unknown as ShopRedis, shopConfig.publicOrigin, process.env.SHOP_ADMIN_WALLET, keyPrefix);
const backendPacksEnabled = process.env.PACK_ENGINE === 'backend' && process.env.PACK_ENABLED === 'true' && shopConfig.enabled && shopConfig.cluster === 'mainnet-beta';
const backendPackSettings = new BackendPackSettingsService(commandClient as unknown as ShopRedis, keyPrefix, backendPacksEnabled);
const shopAdmin = new ShopAdminService(commandClient as unknown as ShopRedis, shopConfig, pricing, createPackAdminChain(shopConfig, adminAuth.address), keyPrefix,
  new ShopUsdRatesService(commandClient as unknown as ShopRedis, process.env.JUPITER_API_KEY, keyPrefix), backendPackSettings);
const shop = new ShopService(commandClient as unknown as ShopRedis, shopConfig, createShopChain(shopConfig), keyPrefix, seekerVerification, pricing);
const packs = new BackendPackService(commandClient as unknown as ShopRedis, backendPackSettings, createBackendPackChain(shopConfig),
  backendPacksEnabled, shopConfig.publicOrigin, keyPrefix, createPackChain(shopConfig, false));
diagnose({ level: 'info', event: pushNotifier.enabled ? 'push.enabled' : 'push.disabled' });
const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const appMetadata = readAppRequestMetadata(request.headers);
  if (appMetadata) diagnose({ level: 'info', event: 'api.request', route: apiRouteFamily(requestUrl.pathname), app: appMetadata });
  if (requestUrl.pathname === '/mobile/update-policy') {
    if (!applyCors(request.headers.origin, response)) return;
    sendMobileUpdatePolicy(request, response, mobileUpdatePolicy);
    return;
  }
  if (requestUrl.pathname.startsWith('/shop/')) {
    if (!applyCors(request.headers.origin, response)) return;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    try {
      if (requestUrl.pathname.startsWith('/shop/admin/')) {
        await handleShopAdmin(request, response, requestUrl.pathname, { auth: adminAuth, service: shopAdmin, prices: pricing, verifyPlayer: verifyBearerSession, readBody: readJsonBody }); return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/shop/figures') {
        response.writeHead(200).end(JSON.stringify(figureManifest(shopConfig.publicOrigin))); return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/shop/catalog') {
        const catalogVersion = requestUrl.searchParams.get('catalogVersion');
        await sendJson(response, 200, shop.liveCatalog(catalogVersion === '4' ? 4 : catalogVersion === '3' ? 3 : catalogVersion === '2' ? 2 : 1));
        return;
      }
      const playerId = verifyBearerSession(request.headers.authorization);
      if (request.method === 'GET' && requestUrl.pathname === '/shop/packs/catalog') {
        await sendJson(response, 200, packs.catalog()); return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/shop/packs/orders') {
        await sendJson(response, 201, packs.create(playerId, await readJsonBody(request))); return;
      }
      const packMatch = /^\/shop\/packs\/orders\/([a-f0-9]{64})(\/submit)?$/.exec(requestUrl.pathname);
      if (packMatch && request.method === 'GET' && !packMatch[2]) {
        const result = await packs.get(playerId, packMatch[1]!);
        if (result.status === 'confirmed') await walletVerification.bindVerified(playerId, result.buyer);
        response.writeHead(200).end(JSON.stringify(result)); return;
      }
      if (packMatch && request.method === 'POST' && packMatch[2]) {
        const body = await readJsonBody(request); const result = await packs.submit(playerId, packMatch[1]!, body.transaction);
        if (result.status === 'confirmed') await walletVerification.bindVerified(playerId, result.buyer);
        response.writeHead(200).end(JSON.stringify(result)); return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/shop/seeker/challenge') {
        const result = await seekerVerification.issue(playerId);
        response.writeHead(201).end(JSON.stringify(result));
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/shop/wallet/challenge') {
        const result = await walletVerification.issue(playerId);
        response.writeHead(201).end(JSON.stringify(result));
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/shop/wallet/verify') {
        const result = await walletVerification.verify(playerId, await readJsonBody(request));
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/shop/wallet') {
        await walletVerification.clear(playerId);
        response.writeHead(204).end();
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/shop/inventory') {
        const result = await figureInventory.get(playerId);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (request.method === 'PUT' && requestUrl.pathname === '/shop/loadout') {
        const result = await figureInventory.save(playerId, await readJsonBody(request));
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/shop/seeker/verify') {
        const result = await seekerVerification.verify(playerId, await readJsonBody(request));
        // The same one-time SIWS proof already authenticated this address. Bind
        // it for inventory too, so a confirmed mint opens in Army without a
        // second, redundant signature prompt.
        await walletVerification.bindVerified(playerId, result.address);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/shop/orders') {
        const result = await shop.create(playerId, await readJsonBody(request));
        response.writeHead(201).end(JSON.stringify(result));
        return;
      }
      if (await handleShopReconciliation(request, response, requestUrl.pathname, { service: shop, verifyPlayer: () => playerId, readBody: readJsonBody })) return;
      const match = /^\/shop\/orders\/([a-f0-9]{64})(\/submit)?$/.exec(requestUrl.pathname);
      if (match && request.method === 'GET' && !match[2]) {
        const result = await shop.get(playerId, match[1]!);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      if (match && request.method === 'POST' && match[2] === '/submit') {
        const body = await readJsonBody(request);
        const result = await shop.submit(playerId, match[1]!, body.transaction);
        response.writeHead(200).end(JSON.stringify(result));
        return;
      }
      response.writeHead(404).end(JSON.stringify({ error: 'Shop endpoint not found' }));
    } catch (error) {
      const status = error instanceof BodyTooLargeError ? 413 : error instanceof AuthenticationError ? 401 : error instanceof ShopError ? error.status : 503;
      response.writeHead(status).end(JSON.stringify({ error: error instanceof ShopError ? error.message : status === 503 ? 'The shop is temporarily unavailable. Try again shortly.' : error instanceof Error ? error.message : 'Invalid request', ...(error instanceof ShopError && error.recovery ? { recovery: error.recovery } : {}) }));
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
let packRecoveryRunning = false;
const packRecoveryInterval = setInterval(() => {
  if (packRecoveryRunning) return;
  packRecoveryRunning = true;
  void packs.recoverDue(() => diagnose({ level: 'error', event: 'pack.recovery_delayed' }))
    .catch(() => diagnose({ level: 'error', event: 'pack.recovery_failed' }))
    .finally(() => { packRecoveryRunning = false; });
}, 5000);
packRecoveryInterval.unref();

await subscriber.pSubscribe(store.eventPattern, (gameId) => {
  void gameSockets.broadcast(gameId);
});

function applyCors(origin: string | undefined, response: import('node:http').ServerResponse) {
  if (origin && !allowedOrigins.has(origin)) {
    response.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Origin is not allowed' }));
    return false;
  }
  if (origin) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-headers', 'authorization, content-type, x-ripsy-app-version, x-ripsy-app-build, x-ripsy-app-platform, x-ripsy-app-channel');
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
  clearInterval(packRecoveryInterval);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([subscriber.quit(), commandClient.quit()]);
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
