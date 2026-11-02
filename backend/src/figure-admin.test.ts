import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { deflateSync } from 'node:zlib';
import { createClient } from 'redis';
import { FigureAdminService, FIGURE_PUBLISH_CAS } from './figure-admin.js';
import { BUILTIN_FIGURES, FIGURES, FIGURE_TOKEN_PAYMENTS, installAdminFigures } from './figure-registry.js';
import { figureManifest } from './figure-resources.js';
import { decodeFigureUpload, validateFigurePng, validateFigureRive } from './figure-upload-validation.js';
import { handleShopAdmin } from './shop-admin-http.js';
import { serveFigureResource } from './figure-admin-http.js';
import { readJsonBody } from './http-body.js';
import { loadShopConfig } from './shop-config.js';
import { ShopPricingService } from './shop-pricing.js';
import { ShopService, type ShopRedis } from './shop-service.js';
import { createFigureAssetSource } from './figure-inventory.js';

const png = readFileSync(new URL('../../frontend/apps/web/public/figures/alien.png', import.meta.url));
const rive = readFileSync(new URL('../../frontend/apps/web/public/figures/alien.riv', import.meta.url));
const upload = (overrides = {}) => ({ requestId: 'local-upload-request-0001', id: 'moon-fighter', name: 'Moon fighter', description: 'Ready for a new mission.', currency: 'SKR', price: '450', riveBase64: rive.toString('base64'), pngBase64: png.toString('base64'), ...overrides });
function pngChunk(type: string, body: Buffer) {
  const chunk = Buffer.alloc(12 + body.length); chunk.writeUInt32BE(body.length); chunk.write(type, 4); body.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) { crc ^= byte; for (let n = 0; n < 8; n++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4); return chunk;
}
function syntheticPng({ width = 1, height = 1, depth = 8, color = 6, interlace = 0, raw = Buffer.alloc(5), extra = Buffer.alloc(0) } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = depth; header[9] = color; header[12] = interlace;
  return Buffer.concat([png.subarray(0, 8), pngChunk('IHDR', header), extra, pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

test('upload decoders and static PNG checks reject malformed or excessive binary data', () => {
  assert.deepEqual(decodeFigureUpload(png.toString('base64'), 'png'), png); validateFigurePng(png);
  for (const input of [null, '', 'AA==', png.toString('base64') + '\n', 'A'.repeat(4 * Math.ceil(4 * 1048576 / 3) + 4)]) assert.throws(() => decodeFigureUpload(input, 'png'));
  for (const bytes of [Buffer.alloc(32), png.subarray(0, -1), Buffer.concat([png, Buffer.of(1)])]) assert.throws(() => validateFigurePng(bytes));
  const badCrc = Buffer.from(png); badCrc[20] = badCrc[20]! ^ 1; assert.throws(() => validateFigurePng(badCrc));
  validateFigurePng(syntheticPng());
  for (const options of [{ width: 2049 }, { height: 0 }, { depth: 16 }, { color: 3 }, { interlace: 1 }, { raw: Buffer.alloc(4) }, { raw: Buffer.alloc(1000000) }, { raw: Buffer.from([5, 0, 0, 0, 0]) }, { extra: pngChunk('acTL', Buffer.alloc(8)) }, { extra: pngChunk('BADX', Buffer.alloc(0)) }]) assert.throws(() => validateFigurePng(syntheticPng(options)));
});
test('all eight shipping Rives satisfy the actual isolated parser contract; invalid input fails closed', async () => {
  for (const figure of BUILTIN_FIGURES) await validateFigureRive(readFileSync(new URL(`../../frontend/apps/web/public/figures/${figure.id}.riv`, import.meta.url)));
  for (const bytes of [Buffer.alloc(20), png, rive.subarray(0, 100)]) await assert.rejects(() => validateFigureRive(bytes), /incompatible/);
  await assert.rejects(() => validateFigureRive(Buffer.alloc(8 * 1048576 + 1)), /exceeds/);
});
test('JSON body caps stay small except for explicitly opted-in uploads, including chunked input', async () => {
  const req = (chunks: string[], length?: number) => Object.assign(Readable.from(chunks.map(v => Buffer.from(v))), { headers: length === undefined ? {} : { 'content-length': String(length) } }) as unknown as IncomingMessage;
  assert.deepEqual(await readJsonBody(req(['{"x":', '1}'])), { x: 1 });
  await assert.rejects(() => readJsonBody(req(['{}'], 5000)), /too large/);
  await assert.rejects(() => readJsonBody(req(['{"x":"', 'a'.repeat(5000), '"}'])), /too large/);
  assert.equal((await readJsonBody(req([JSON.stringify({ x: 'a'.repeat(5000) })]), 6000)).x, 'a'.repeat(5000));
  for (const value of ['[]', 'null', '3']) await assert.rejects(() => readJsonBody(req([value])), /object/);
});
test('upload HTTP handler authenticates before consuming or validating a body', async () => {
  let reads = 0, prepare = 0;
  await assert.rejects(() => handleShopAdmin({ method: 'POST', headers: {} } as IncomingMessage, {} as ServerResponse, '/shop/admin/figures/draft', {
    auth: { authenticate: async () => { throw new Error('Admin required'); } }, figures: { prepare: async () => { prepare++; } },
    readBody: async () => { reads++; return {}; },
  } as unknown as Parameters<typeof handleShopAdmin>[3]), /Admin required/);
  assert.equal(reads, 0); assert.equal(prepare, 0);
});

// A real disposable Redis is required to verify Lua/TTL/persistence semantics.
// Never accepts a Redis URL or connects to the application's Redis.
test('real Redis: draft → atomic publication → replica/restart/resources and safe recovery', { skip: !process.env.REDIS_TEST_SERVER, timeout: 120000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'rf-')), socket = join(directory, 'redis.sock');
  let process_: ChildProcess | undefined;
  const redis = createClient({ socket: { path: socket, reconnectStrategy: false } }); redis.on('error', () => {});
  const start = async () => {
    process_ = spawn(process.env.REDIS_TEST_SERVER!, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--dir', directory, '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; process_.stderr?.on('data', b => { log += b; }); process_.stdout?.on('data', b => { log += b; });
    for (let i = 0; ; i++) {
      try { await redis.connect(); break; } catch {}
      if (i > 100 || process_.exitCode !== null) throw new Error(`Local test Redis failed: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const stop = async () => { if (redis.isOpen) await redis.close(); if (process_?.exitCode === null) { const ended = once(process_, 'exit'); process_.kill('SIGTERM'); await ended; } };
  const baseline = JSON.stringify(FIGURES), tokenBaseline = structuredClone(FIGURE_TOKEN_PAYMENTS);
  try {
    await start(); const service = new FigureAdminService(redis as unknown as ShopRedis, 'https://assets.example.test', 'test');
    await service.refresh();
    const config = { ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta' as const };
    const pricing = new ShopPricingService(redis as unknown as ShopRedis, config, 'test');
    const oldPrices = await pricing.get();
    await redis.set('test:shop:pack-settings', 'unchanged pack'); await redis.set('test:shop:order:paid', 'unchanged receipt');
    await t.test('validate values and preserve invisible draft until explicit publication', async () => {
      for (const patch of [{ id: 'fig2' }, { id: '../bad' }, { name: '' }, { description: '' }, { currency: 'NEW' }, { price: '0' }, { price: '0.0000001' }, { price: '1e3' }, { riveBase64: 'no' }, { pngBase64: 'no' }]) await assert.rejects(() => service.prepare('admin', async () => upload(patch)));
      const prepared = await service.prepare('admin', async () => upload());
      assert.equal(prepared.revision, 0); assert.equal(prepared.published.length, 0); assert.equal(prepared.draft!.price, '450');
      assert.equal(FIGURES.length, 8); assert.equal((await service.snapshot('other')).draft, null);
      assert.ok((await redis.ttl('test:shop:figure-registry:v1:draft')) > 1700);
      assert.equal((await service.prepare('admin', async () => upload())).draft!.createdAt, prepared.draft!.createdAt);
      await assert.rejects(() => service.prepare('admin', async () => upload({ price: '451' })), /already awaiting/);
      await assert.rejects(() => service.discard('other', upload().requestId), /changed/);
      await assert.rejects(() => service.publish('other', { requestId: upload().requestId, expectedRevision: 0 }), /expired or changed/);
      await assert.rejects(() => service.resource(`${prepared.draft!.riveSha256}.riv`), /not found/);
      await assert.rejects(() => service.publish('admin', { requestId: upload().requestId, expectedRevision: 1 }), /changed/);
    });
    await t.test('Lua fence and blob-collision failure make no partial writes', async () => {
      const key = 'test:shop:figure-registry:v1';
      assert.equal(await redis.eval(FIGURE_PUBLISH_CAS, { keys: [key, `${key}:draft`, `${key}:lock`, 'new-rive', 'new-png', 'new-meta'], arguments: ['lost-lease', '0', upload().requestId, 'no', '{}', 'e30='] }), -2);
      assert.equal(await redis.exists('new-rive'), 0); assert.equal(await redis.exists(key), 0);
      const d = (await service.snapshot('admin')).draft!;
      const blob = `${key}:asset:${d.riveSha256}.riv`;
      await redis.set(blob, 'conflicting bytes');
      await assert.rejects(() => service.publish('admin', { requestId: upload().requestId, expectedRevision: 0 }), /did not commit/);
      assert.equal(await redis.get(blob), 'conflicting bytes'); assert.equal(await redis.exists(key), 0);
      assert.equal(await redis.exists(`${key}:asset:${d.pngSha256}.png`), 0);
      await redis.del(blob);
    });
    const published = await service.publish('admin', { requestId: upload().requestId, expectedRevision: 0 });
    const figure = published.published[0]!;
    await t.test('publication is idempotent, immutable, durable and does not affect existing prices/pack/receipts', async () => {
      assert.equal(published.revision, 1); assert.equal(figure.variant, 9); assert.equal(figure.seekerExclusive, false); assert.equal(published.draft, null);
      assert.deepEqual(await service.publish('admin', { requestId: upload().requestId, expectedRevision: 0 }), published);
      await assert.rejects(() => service.prepare('admin', async () => upload()), /already published/);
      await assert.rejects(() => service.prepare('admin', async () => upload({ requestId: 'new-upload-request-0002' })), /unused/);
      assert.deepEqual(FIGURES.slice(0, 8), JSON.parse(baseline));
      assert.deepEqual((await pricing.get()).figures.slice(0, oldPrices.figures.length), oldPrices.figures);
      assert.deepEqual(await pricing.payment(figure.id), { price: '0', tokenPayment: { ...tokenBaseline.fig2!, amount: '450000000' } });
      assert.equal(await redis.get('test:shop:pack-settings'), 'unchanged pack'); assert.equal(await redis.get('test:shop:order:paid'), 'unchanged receipt');
      assert.equal(await redis.ttl('test:shop:figure-registry:v1'), -1);
      for (const resource of [figure.animation, figure.portrait!]) assert.equal(await redis.ttl(`test:shop:figure-registry:v1:asset:${new URL(resource.url).pathname.split('/').pop()}`), -1);
      assert.equal(figureManifest(config.publicOrigin).figures.at(-1)!.animation.url, figure.animation.url);
      assert.throws(() => installAdminFigures([]), /cannot be removed/);
    });
    await t.test('replicas reload on restart, with stable metadata and inventory identity', async () => {
      await redis.sendCommand(['SAVE']); await stop(); await start();
      const replica = new FigureAdminService(redis as unknown as ShopRedis, 'https://assets.example.test', 'test');
      assert.deepEqual(await replica.snapshot('admin'), published);
      const registration = FIGURES.at(-1)!;
      const metadata = await replica.resource(new URL(registration.resources!.metadata).pathname.split('/').pop()!);
      assert.equal(JSON.parse(metadata.bytes.toString()).attributes[0].value, figure.id);
      t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ result: { items: [{ id: 'Vote111111111111111111111111111111111111111', interface: 'MplCoreAsset', grouping: [{ group_key: 'collection', group_value: 'collection' }], content: { json_uri: registration.resources!.metadata, metadata: { attributes: [{ trait_type: 'Figure', value: figure.id }] } } }] } })));
      const owned = await createFigureAssetSource('https://rpc.example.test', 'collection', config.publicOrigin).listOwned('11111111111111111111111111111111');
      assert.equal(owned[0]!.figureId, figure.id); assert.equal(owned[0]!.imageUrl, figure.imageUrl);
      t.mock.restoreAll();
    });
    await t.test('public resources are exact bytes, HEAD/ETag cached and fail closed if corrupted', async () => {
      const server = createServer(async (request, response) => { try { if (!await serveFigureResource(request, response, request.url!, service)) response.writeHead(404).end(); } catch (e) { response.writeHead((e as { status: number }).status ?? 503).end(); } });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const url = `http://127.0.0.1:${(server.address() as { port: number }).port}${new URL(figure.imageUrl).pathname}`;
        const response = await fetch(url); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.match(response.headers.get('cache-control')!, /immutable/); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
        assert.equal((await fetch(url, { headers: { 'if-none-match': response.headers.get('etag')! } })).status, 304);
        const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(head.headers.get('content-length'), String(png.length));
        assert.equal((await fetch(url, { method: 'POST' })).status, 405);
        const key = `test:shop:figure-registry:v1:asset:${new URL(figure.imageUrl).pathname.split('/').pop()}`;
        await redis.set(key, 'corrupt'); assert.equal((await fetch(url)).status, 503); await redis.set(key, png.toString('base64'));
      } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    });
    await t.test('discard/expiry/lease loss cannot publish and next SOL figure allocates a fresh variant', async () => {
      const second = upload({ requestId: 'local-upload-request-0002', id: 'sun-fighter', currency: 'SOL', price: '0.01' });
      await service.prepare('admin', async () => second); await service.discard('admin', second.requestId);
      await assert.rejects(() => service.publish('admin', { requestId: second.requestId, expectedRevision: 1 }), /expired or changed/);
      const leaseLoss = new FigureAdminService(redis as unknown as ShopRedis, 'https://assets.example.test', 'test', async () => { await redis.set('test:shop:figure-registry:v1:lock', 'another-owner', { EX: 60 }); });
      await assert.rejects(() => leaseLoss.prepare('admin', async () => second), /timed out/); assert.equal(await redis.get('test:shop:figure-registry:v1:lock'), 'another-owner'); await redis.del('test:shop:figure-registry:v1:lock');
      await service.prepare('admin', async () => second);
      const raw = JSON.parse((await redis.get('test:shop:figure-registry:v1:draft'))!); raw.view.expiresAt = Date.now() - 1; await redis.set('test:shop:figure-registry:v1:draft', JSON.stringify(raw));
      await assert.rejects(() => service.publish('admin', { requestId: second.requestId, expectedRevision: 1 }), /expired or changed/);
      await service.prepare('admin', async () => second); const next = await service.publish('admin', { requestId: second.requestId, expectedRevision: 1 });
      assert.equal(next.published[1]!.variant, 10); assert.equal((await pricing.payment('sun-fighter')).price, '10000000');
      const shop = new ShopService(redis as unknown as ShopRedis, config, {} as never);
      assert.equal((await shop.liveCatalog(4)).figures.at(-1)!.priceLamports, '10000000'); assert.equal((await shop.liveCatalog(3)).figures.length, 4);
    });
  } finally {
    await stop(); rmSync(directory, { recursive: true, force: true });
    FIGURES.splice(0, FIGURES.length, ...JSON.parse(baseline)); for (const key of Object.keys(FIGURE_TOKEN_PAYMENTS)) delete FIGURE_TOKEN_PAYMENTS[key]; Object.assign(FIGURE_TOKEN_PAYMENTS, tokenBaseline);
  }
});
