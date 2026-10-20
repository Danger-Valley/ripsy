import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { parsePackOrder, type PackOrder } from '@rps/core/packs';
import { BackendPackSettingsService, DEFAULT_BACKEND_PACK } from './backend-pack-settings.js';
import { BackendPackService, backendPackResult } from './backend-pack-service.js';
import type { BackendPackChain } from './backend-pack-chain.js';
import type { ShopRedis } from './shop-service.js';
import { ShopError } from './shop-error.js';
import { handleShopAdmin } from './shop-admin-http.js';
import { ShopAdminService } from './shop-admin.js';
import { loadShopConfig } from './shop-config.js';

class MemoryRedis implements ShopRedis {
  data = new Map<string, string>(); due = new Map<string, number>(); ttl = new Map<string, number>();
  failWrites = false;
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); return 'OK';
  }
  async eval(script: string, { keys, arguments: a }: { keys: string[]; arguments: string[] }) {
    const key = keys[0]!;
    if (script.includes('backend-pack-settings-cas')) {
      const old = this.data.get(key); if ((old ? JSON.parse(old).catalog.version : 1) !== Number(a[0])) return 0;
      this.data.set(key, a[1]!); return 1;
    }
    if (script.includes('backend-pack-order-write')) {
      if (this.failWrites || this.data.get(key) !== a[0]) return 0;
      this.data.set(keys[1]!, a[1]!); this.ttl.set(keys[1]!, Number(a[2]));
      if (a[5] === '1') this.due.delete(a[4]!); else this.due.set(a[4]!, Number(a[3]));
      return 1;
    }
    if (script.includes('INCR')) { const next = Number(this.data.get(key) ?? 0) + 1; this.data.set(key, String(next)); return next; }
    if (script.includes('ZRANGEBYSCORE')) return [...this.due].filter(([, at]) => at <= Number(a[0])).slice(0, 5).map(([id]) => id);
    if (script.includes('ZREM')) { this.due.delete(a[0]!); return 1; }
    if (this.data.get(key) === a[0]) this.data.delete(key);
    return 1;
  }
}
const buyer = '11111111111111111111111111111111';
const otherBuyer = 'So11111111111111111111111111111111111111112';
const request = { buyer, idempotencyKey: 'backend-pack-request-1234' };
function fixture() {
  const redis = new MemoryRedis(); const settings = new BackendPackSettingsService(redis);
  let payment: 'pending' | 'paid' | 'failed' | 'expired' = 'pending';
  let delivered = false, prepareCount = 0, deliveryCount = 0, draws = 0;
  const sends: string[] = [];
  const chain: BackendPackChain = {
    async prepare(address, _id, _nonce, catalog, mode) {
      prepareCount++; return { engine: 'backend', buyer: address, cluster: 'mainnet-beta', transaction: 'AQ==',
        deliveryFunding: { recipient: otherBuyer, amountLamports: '2759680' },
        receipt: buyer, asset: buyer, edition: buyer, version: catalog.version, payment: catalog.payment,
        drops: catalog.drops, networkFeeLamports: '2769680', lastValidBlockHeight: 100,
        ...(mode ? { solFunding: { inputLamports: '1', outputMint: catalog.payment.mint,
          minimumOutput: catalog.payment.amount, expectedOutput: catalog.payment.amount, shortfall: catalog.payment.amount, slippageBps: 50 } } : {}) };
    },
    validateSigned(_order, signed) { if (signed !== 'signed-payment') throw new ShopError('Invalid signature'); return 's'.repeat(64); },
    async send(bytes) { sends.push(bytes); },
    async paymentStatus(order) { return { status: payment, signature: order.signature ?? (payment === 'paid' ? 's'.repeat(64) : null) }; },
    async prepareDelivery(order) { deliveryCount++; assert.ok(order.result); return { transaction: 'signed-delivery', signature: 'd'.repeat(64), lastValidBlockHeight: 200 }; },
    async deliveryStatus() { return delivered ? 'confirmed' : 'pending'; },
  };
  const service = () => new BackendPackService(redis, settings, chain, true, 'https://www.ripsy.fun', 'ripsy', undefined,
    () => { draws++; return new Uint8Array(32).fill(42); });
  return { redis, settings, chain, service: service(), replica: service(), sends,
    setPayment(value: typeof payment) { payment = value; }, delivered() { delivered = true; },
    counts: () => ({ prepareCount, deliveryCount, draws }) };
}

test('backend default price and chances preserve the live retired settings, with no onchain read', async () => {
  const f = fixture(); const value = await f.settings.get();
  assert.equal(value.catalog.payment.amount, '10000000');
  assert.deepEqual(value.catalog.drops, [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }]);
  assert.equal((await f.settings.catalog(false)).available, false);
  assert.equal(f.counts().prepareCount, 0);
  assert.equal((await f.service.catalog()).deliveryPayment, 'buyer-prepaid');
});
test('backend administration rejects every old onchain job route before any chain call or replay', async () => {
  const f = fixture();
  const service = new ShopAdminService(f.redis, loadShopConfig({}), { async get() { return {}; } } as never,
    new Proxy({}, { get() { throw new Error('Retired chain must not be called'); } }) as never, 'ripsy', undefined, f.settings);
  assert.equal((await service.snapshot()).backendPack?.catalog.engine, 'backend');
  await assert.rejects(() => service.prepare(buyer, {}), /saved on the server/);
  await assert.rejects(() => service.get(buyer, 'a'.repeat(64)), /retired/);
  await assert.rejects(() => service.submit(buyer, 'a'.repeat(64), 'signed'), /retired/);
});
test('admin saves price, chances, pause and audit atomically; stale concurrent saves cannot overwrite', async () => {
  const f = fixture(); const input = { expectedVersion: 1, price: '12.5', available: true, drops: [{ figureId: 'ore', weight: 1000000 }] };
  const [a, b] = await Promise.allSettled([f.settings.save(buyer, input), f.settings.save(buyer, { ...input, price: '2' })]);
  assert.equal([a, b].filter(v => v.status === 'fulfilled').length, 1);
  const current = await f.settings.get(); assert.equal(current.catalog.version, 2); assert.equal(current.audit.length, 1);
  assert.deepEqual(current.audit[0]!.before, DEFAULT_BACKEND_PACK);
  assert.equal(current.audit[0]!.address, buyer);
  const paused = await f.settings.save(buyer, { ...input, expectedVersion: 2, available: false });
  assert.equal(paused.catalog.available, false); assert.equal((await f.settings.catalog(true)).available, false);
});
test('admin rejects invalid odds, duplicates, restricted/unregistered figures and invalid price precision', async () => {
  const f = fixture(); const input = { expectedVersion: 1, price: '10', available: true, drops: DEFAULT_BACKEND_PACK.drops };
  for (const change of [
    { price: '0' }, { price: '1e3' }, { price: '1.0000001' }, { drops: [] },
    { drops: [{ figureId: 'ore', weight: 999999 }] }, { drops: [{ figureId: 'fig2', weight: 1000000 }] },
    { drops: [{ figureId: 'missing', weight: 1000000 }] },
    { drops: [{ figureId: 'ore', weight: 500000 }, { figureId: 'ore', weight: 500000 }] },
  ]) await assert.rejects(() => f.settings.save(buyer, { ...input, ...change }));
  assert.equal((await f.settings.get()).catalog.version, 1);
});
test('unpaid orders reveal no result, never draw or deliver, and are scoped to their player/buyer', async () => {
  const f = fixture(); const order = await f.service.create('player', { ...request, result: 'ore', price: '1' });
  assert.equal(order.result, null); assert.equal(order.randomness, null); assert.equal(order.payment.amount, '10000000');
  assert.equal(parsePackOrder(order).engine, 'backend');
  assert.deepEqual(f.counts(), { prepareCount: 1, deliveryCount: 0, draws: 0 });
  assert.deepEqual(await f.replica.create('player', request), order);
  await assert.rejects(() => f.replica.get('other-player', order.id), /not found/);
  await assert.rejects(() => f.service.create('player', { ...request, buyer: otherBuyer }), /already used/);
  await assert.rejects(() => f.service.submit('player', order.id, 'tampered'), /signature/);
  assert.deepEqual(f.sends, []);
});
test('global or admin pause blocks new payment preparation but preserves paid recovery', async () => {
  const f = fixture(); const disabled = new BackendPackService(f.redis, f.settings, f.chain, false, 'https://www.ripsy.fun');
  await assert.rejects(() => disabled.create('player', request), /not available/);
  const order = await f.service.create('player', request); f.setPayment('paid');
  const saved = await disabled.get('player', order.id); assert.equal(saved.status, 'ready-to-claim');
  assert.ok(saved.result); assert.ok(saved.randomness);
  assert.equal((await disabled.get('player', order.id)).randomness, saved.randomness);
});
test('Buy with SOL preserves the quoted SKR price, shortfall and saved order across retries', async () => {
  const f = fixture(); const order = await f.service.create('player', { ...request, paymentMode: 'sol' });
  assert.equal(order.solFunding?.shortfall, '10000000'); assert.equal(order.payment.amount, '10000000');
  assert.equal(parsePackOrder(order).engine, 'backend');
  assert.deepEqual(await f.replica.create('player', request), order);
  assert.equal(f.counts().prepareCount, 1); assert.equal(f.counts().draws, 0);
});
test('saved payment bytes and immutable result persist before any broadcast; restarts do not charge or re-roll', async () => {
  const f = fixture(); const order = await f.service.create('player', request);
  f.chain.send = async bytes => {
    const saved = JSON.parse(f.redis.data.get(`ripsy:packs:order:${order.id}`)!);
    if (bytes === 'signed-payment') assert.equal(saved.signed, bytes);
    else { assert.equal(saved.paid, true); assert.ok(saved.order.result); assert.equal(saved.delivery.transaction, bytes); }
    f.sends.push(bytes); throw new Error('Ambiguous transport failure');
  };
  assert.equal((await f.service.submit('player', order.id, 'signed-payment')).status, 'submitted');
  assert.equal(f.counts().draws, 0);
  f.setPayment('paid');
  const pending = await f.replica.get('player', order.id); assert.equal(pending.status, 'ready-to-claim');
  assert.equal(f.redis.ttl.get(`ripsy:packs:order:${order.id}`), 0);
  const result = pending.result, entropy = pending.randomness;
  await f.service.get('player', order.id); assert.equal(f.counts().draws, 1); assert.equal(f.counts().deliveryCount, 1);
  f.delivered(); const confirmed = await f.replica.get('player', order.id);
  assert.equal(confirmed.status, 'confirmed'); assert.equal(confirmed.result, result); assert.equal(confirmed.randomness, entropy);
  assert.equal(f.redis.ttl.get(`ripsy:packs:order:${order.id}`), 0);
  assert.equal(f.redis.due.has(order.id), false);
  assert.ok(!JSON.stringify(confirmed).includes('nonce')); assert.ok(!JSON.stringify(confirmed).includes('signed-delivery'));
  assert.equal((await f.service.submit('player', order.id, 'signed-payment')).status, 'confirmed');
  assert.equal(f.counts().prepareCount, 1); assert.equal(f.counts().draws, 1);
});
test('admin updates never change saved pack quotes or rewards, including future metadata changes', async () => {
  const f = fixture(); const old = await f.service.create('player', request);
  await f.settings.save(buyer, { expectedVersion: 1, price: '1', available: true, drops: [{ figureId: 'ore', weight: 1000000 }] });
  f.setPayment('paid'); const recovered = await f.replica.get('player', old.id);
  assert.equal(recovered.payment.amount, '10000000'); assert.deepEqual(recovered.drops, DEFAULT_BACKEND_PACK.drops);
  f.setPayment('pending'); const next = await f.service.create('player', { ...request, idempotencyKey: 'backend-another-request-123' });
  assert.equal(next.payment.amount, '1000000'); assert.deepEqual(next.drops, [{ figureId: 'ore', weight: 1000000 }]);
});
test('delivery prepayment is a server-owned snapshot, never replaced on retries or supplied by the client', async () => {
  const f = fixture(); const order = await f.service.create('player', { ...request, deliveryFunding: { amountLamports: '1', recipient: buyer } });
  assert.deepEqual(order.deliveryFunding, { recipient: otherBuyer, amountLamports: '2759680' });
  const prepare = f.chain.prepare;
  f.chain.prepare = async (...args) => ({ ...await prepare(...args), deliveryFunding: { recipient: otherBuyer, amountLamports: '3000000' }, networkFeeLamports: '3010000' });
  assert.deepEqual((await f.replica.create('player', request)).deliveryFunding, order.deliveryFunding);
  const next = await f.service.create('player', { ...request, idempotencyKey: 'new-delivery-fee-request-123' });
  assert.equal(next.deliveryFunding?.amountLamports, '3000000');
  assert.equal(next.payment.amount, order.payment.amount);
  assert.deepEqual(next.drops, order.drops);
});
test('a missing finalized SOL prepayment cannot draw or deliver a pack even when SKR was sent', async () => {
  const f = fixture(); const order = await f.service.create('player', request);
  const status = f.chain.paymentStatus;
  f.chain.paymentStatus = async () => { throw new ShopError('Pack delivery payment verification needs attention.', 503); };
  await assert.rejects(() => f.service.get('player', order.id), /delivery payment verification/);
  const stored = JSON.parse(f.redis.data.get(`ripsy:packs:order:${order.id}`)!);
  assert.equal(stored.paid, false); assert.equal(stored.order.result, null);
  assert.equal(f.counts().draws, 0); assert.equal(f.counts().deliveryCount, 0); assert.deepEqual(f.sends, []);
  f.chain.paymentStatus = status; f.setPayment('paid');
  assert.ok((await f.replica.get('player', order.id)).result);
});
test('old sponsored quotes stay sponsored after upgrade, including paid background delivery', async () => {
  const f = fixture(); const order = await f.service.create('player', request);
  const key = `ripsy:packs:order:${order.id}`, stored = JSON.parse(f.redis.data.get(key)!);
  delete stored.order.deliveryFunding; stored.order.networkFeeLamports = '10000';
  f.redis.data.set(key, JSON.stringify(stored));
  const pending = await f.replica.create('player', request);
  assert.equal(pending.deliveryFunding, undefined); assert.equal(pending.networkFeeLamports, '10000');
  f.setPayment('paid'); const resolved = await f.service.get('player', order.id);
  assert.equal(resolved.deliveryFunding, undefined); assert.ok(resolved.result);
  f.delivered(); assert.equal((await f.replica.get('player', order.id)).status, 'confirmed');
  assert.equal(f.counts().prepareCount, 1); assert.equal(f.counts().draws, 1);
});
test('failed/expired payments do not draw or deliver and late retries keep terminal state', async () => {
  for (const status of ['failed', 'expired'] as const) {
    const f = fixture(); const order = await f.service.create('player', request); f.setPayment(status);
    assert.equal((await f.service.get('player', order.id)).status, status);
    assert.equal((await f.replica.submit('player', order.id, 'signed-payment')).status, status);
    assert.equal(f.counts().draws, 0); assert.equal(f.counts().deliveryCount, 0);
  }
});
test('paid draw survives delivery outages and background recovery after app closure', async () => {
  const f = fixture(); const order = await f.service.create('player', request); f.setPayment('paid');
  const prepare = f.chain.prepareDelivery; f.chain.prepareDelivery = async () => { throw new Error('Delivery offline'); };
  await assert.rejects(() => f.service.get('player', order.id), /offline/);
  const before = JSON.parse(f.redis.data.get(`ripsy:packs:order:${order.id}`)!);
  assert.equal(before.paid, true); assert.ok(before.order.result);
  f.chain.prepareDelivery = prepare; f.delivered(); f.redis.due.set(order.id, 0);
  await f.replica.recoverDue(error => { throw error; });
  const after = await f.service.get('player', order.id);
  assert.equal(after.status, 'confirmed'); assert.equal(after.randomness, before.order.randomness); assert.equal(f.counts().draws, 1);
});
test('a lost Redis lease cannot overwrite a newer quote or broadcast anything', async () => {
  const f = fixture(); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const prepare = f.chain.prepare; let first = true;
  f.chain.prepare = async (...args) => { if (first) { first = false; await gate; } return prepare(...args); };
  const old = f.service.create('player', request);
  await new Promise(resolve => setImmediate(resolve));
  const id = createHash('sha256').update(`player:${request.idempotencyKey}`).digest('hex');
  f.redis.data.delete(`ripsy:packs:lock:${id}`);
  const newer = await f.replica.create('player', request);
  const stored = f.redis.data.get(`ripsy:packs:order:${newer.id}`);
  release(); await assert.rejects(() => old, /updating/);
  assert.equal(f.redis.data.get(`ripsy:packs:order:${newer.id}`), stored); assert.deepEqual(f.sends, []);
});
test('a failed result commit cannot expose a draw or start asset delivery', async () => {
  const f = fixture(); const order = await f.service.create('player', request); f.setPayment('paid');
  f.chain.paymentStatus = async () => { f.redis.failWrites = true; return { status: 'paid', signature: 's'.repeat(64) }; };
  await assert.rejects(() => f.service.get('player', order.id), /updating/);
  assert.equal(f.counts().draws, 0); assert.equal(f.counts().deliveryCount, 0); assert.deepEqual(f.sends, []);
});
test('weighted backend draw is deterministic, excludes zero/absent rewards and rejects invalid totals', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) { const entropy = createHash('sha256').update(String(i)).digest();
    const result = backendPackResult(entropy, DEFAULT_BACKEND_PACK.drops); seen.add(result);
    assert.equal(result, backendPackResult(entropy, DEFAULT_BACKEND_PACK.drops));
    assert.equal(backendPackResult(entropy, [{ figureId: 'ore', weight: 1000000 }]), 'ore');
  }
  assert.deepEqual(seen, new Set(['jup', 'bonk', 'ore']));
  assert.throws(() => backendPackResult(new Uint8Array(31), DEFAULT_BACKEND_PACK.drops));
  assert.throws(() => backendPackResult(new Uint8Array(32), [{ figureId: 'ore', weight: 1 }]));
});
test('pack-settings HTTP saves require authenticated administrative wallet, never a customer bearer', async t => {
  const f = fixture(); let saves = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    try { await handleShopAdmin(req, res, req.url!, {
      auth: { async authenticate(token: string) { if (token !== 'Bearer admin') throw new ShopError('Admin required', 401); return buyer; } } as never,
      service: { async savePack(admin: string, input: Record<string, unknown>) { saves++; return f.settings.save(admin, input); } } as never,
      prices: {} as never, verifyPlayer: () => 'player', async readBody(request) { let body = ''; for await (const chunk of request) body += chunk; return JSON.parse(body); },
    }); } catch (error) { res.writeHead(error instanceof ShopError ? error.status : 500).end(JSON.stringify({ error: (error as Error).message })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/shop/admin/pack-settings`;
  const body = JSON.stringify({ expectedVersion: 1, price: '10', available: true, drops: DEFAULT_BACKEND_PACK.drops });
  assert.equal((await fetch(url, { method: 'PUT', headers: { authorization: 'Bearer player' }, body })).status, 401);
  assert.equal(saves, 0);
  assert.equal((await fetch(url, { method: 'PUT', headers: { authorization: 'Bearer admin' }, body })).status, 200);
  assert.equal(saves, 1);
});
