import assert from 'node:assert/strict';
import test from 'node:test';
import { loadShopConfig, shopCatalog, type ShopConfig } from './shop-config.js';
import { ShopError, ShopService, type ShopRedis } from './shop-service.js';
import type { ShopChain } from './shop-chain.js';
import { FIGURE_TOKEN_PAYMENTS, figurePaymentPrice, figurePurchaseTotal, formatSol, parseShopCatalog } from '@rps/core/shop';

const buyer = '11111111111111111111111111111111';
const config: ShopConfig = { ...loadShopConfig({}), enabled: true, treasury: 'So11111111111111111111111111111111111111112', collection: 'SysvarRent111111111111111111111111111111111', prices: { fig1: '100000000', fig2: '200000000' } };
const input = { figureId: 'fig2', buyer, idempotencyKey: 'purchase-test-123456' };
class MemoryRedis implements ShopRedis {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); return 'OK';
  }
  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    const key = options.keys[0]!;
    if (script.includes('INCR')) { const value = Number(this.data.get(key) ?? 0) + 1; this.data.set(key, String(value)); return value; }
    if (this.data.get(key) === options.arguments[0]) this.data.delete(key);
    return 1;
  }
}
function fixture() {
  const redis = new MemoryRedis();
  let prepares = 0;
  let sends = 0;
  let state: Awaited<ReturnType<ShopChain['status']>> = 'pending';
  const chain: ShopChain = {
    async prepare() { prepares++; return { asset: buyer, transaction: 'unsigned', lastValidBlockHeight: 100, networkFeeLamports: '15000' }; },
    validateSigned(_order, signed) { if (signed !== 'signed') throw new Error('Bad signature'); return '1'.repeat(64); },
    async send() { sends++; },
    async status() { return state; },
  };
  const seeker = { assertVerified: async () => undefined };
  return { redis, chain, service: new ShopService(redis, config, chain, 'ripsy', seeker), replica: new ShopService(redis, config, chain, 'ripsy', seeker), prepares: () => prepares, sends: () => sends, setState: (value: typeof state) => { state = value; } };
}

test('shop is disabled by default; no invented prices and no signing secrets in catalog', () => {
  const defaults = loadShopConfig({ SHOP_MINT_AUTHORITY_SECRET: 'not-public' });
  const catalog = shopCatalog(defaults);
  assert.equal(catalog.cluster, 'devnet');
  assert.ok(catalog.figures.every(figure => !figure.available));
  assert.equal(catalog.figures[0]!.priceLamports, null);
  assert.deepEqual(catalog.figures.map(figure => figure.id), ['fig2', 'bonk', 'jup']);
  assert.ok(!JSON.stringify(catalog).includes('not-public'));
  assert.throws(() => loadShopConfig({ SHOP_ENABLED: 'true' }), /incomplete/);
  for (const price of ['0', '-1', '0.1', '1e9', '9007199254740992']) assert.throws(() => loadShopConfig({ SHOP_FIG2_PRICE_LAMPORTS: price }), /lamports/);
  assert.equal(formatSol('1'), '0.000000001 SOL');
  assert.equal(formatSol('1200000000'), '1.2 SOL');
  assert.equal(loadShopConfig({ SOLANA_RPC_URL: 'https://mainnet.example.test' }).seekerRpcUrl, 'https://mainnet.example.test');
});

test('prices are server owned and idempotency survives switching replicas', async () => {
  const f = fixture();
  const first = await f.service.create('player', { ...input, priceLamports: '1' });
  const repeated = await f.replica.create('player', input);
  assert.deepEqual(first, repeated);
  assert.equal(first.priceLamports, '200000000');
  assert.equal(f.prepares(), 1);
  await assert.rejects(() => f.replica.create('player', { ...input, buyer: 'SysvarC1ock11111111111111111111111111111111' }), /already used/);
});

test('catalog exposes the default or configured store referral URL, with no unsafe schemes', () => {
  assert.equal(shopCatalog(loadShopConfig({})).solanaMobileStoreUrl, 'https://store.solanamobile.com/');
  const referral = 'https://store.solanamobile.com/?ref=ripsy&utm_source=app';
  assert.equal(shopCatalog(loadShopConfig({ SHOP_SOLANA_MOBILE_STORE_URL: referral })).solanaMobileStoreUrl, referral);
  for (const value of ['javascript:alert(1)', 'http://store.solanamobile.com/', 'https://user:password@store.solanamobile.com/', 'not-a-url']) {
    assert.throws(() => loadShopConfig({ SHOP_SOLANA_MOBILE_STORE_URL: value }), /SHOP_SOLANA_MOBILE_STORE_URL/);
  }
});

test('two replicas cannot simultaneously construct the same purchase', async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.service.create('player', input), f.replica.create('player', input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.prepares(), 1);
  assert.ok(await f.replica.create('player', input));
});

test('order scope, input validation and rate limiting cannot be bypassed by a price override', async () => {
  const f = fixture();
  const order = await f.service.create('player', input);
  await assert.rejects(() => f.replica.get('someone-else', order.id), /not found/);
  await assert.rejects(() => f.service.create('player', { ...input, figureId: 'injected' }), /Unknown figure/);
  await assert.rejects(() => f.service.create('player', { ...input, figureId: 'fig1' }), /free for every player/);
  await assert.rejects(() => f.service.create('player', { ...input, buyer: 'bad wallet' }), /Invalid wallet/);
  await assert.rejects(() => f.service.create('player', { ...input, buyer: config.treasury }), /customer wallet/);
  for (let i = 1; i < 8; i++) await f.service.create('player', { ...input, idempotencyKey: `purchase-request-${i}` });
  await assert.rejects(() => f.service.create('player', { ...input, idempotencyKey: 'purchase-request-overflow' }), /Too many/);
});

test('Seeker fighter requires a backend-verified Seeker wallet before preparing a transaction', async () => {
  const f = fixture();
  const checked: string[] = [];
  const service = new ShopService(f.redis, config, f.chain, 'ripsy', {
    async assertVerified(_playerId, address) { checked.push(address); throw new ShopError('Seeker required', 403); },
  });
  await assert.rejects(() => service.create('player', { ...input, figureId: 'fig2' }), /Seeker required/);
  assert.deepEqual(checked, [buyer]);
  assert.equal(f.prepares(), 0);
});

test('signed bytes are saved before broadcast; transport ambiguity is recovered by another replica', async () => {
  const f = fixture();
  const order = await f.service.create('player', input);
  f.chain.send = async () => {
    const stored = JSON.parse((await f.redis.get(`ripsy:shop:order:${order.id}`))!);
    assert.equal(stored.signed, 'signed');
    assert.equal(stored.order.status, 'submitted');
    throw new Error('Network response lost');
  };
  assert.equal((await f.service.submit('player', order.id, 'signed')).status, 'submitted');
  f.setState('confirmed');
  assert.equal((await f.replica.get('player', order.id)).status, 'confirmed');
  assert.equal((await f.replica.submit('player', order.id, 'signed')).status, 'confirmed');
  assert.equal(f.prepares(), 1);
  assert.equal(JSON.parse((await f.redis.get(`ripsy:shop:order:${order.id}`))!).signed, undefined);
});

test('invalid signatures never broadcast; terminal/expired orders never create replacement payments', async () => {
  const f = fixture();
  const order = await f.service.create('player', input);
  await assert.rejects(() => f.service.submit('player', order.id, 'tampered'), /signature/);
  assert.equal(f.sends(), 0);
  f.setState('expired');
  assert.equal((await f.service.submit('player', order.id, 'signed')).status, 'expired');
  assert.equal((await f.replica.create('player', input)).status, 'expired');
  assert.equal(f.prepares(), 1);
  assert.equal(f.sends(), 0);
});

test('network errors do not erase an order or make it safe to charge again', async () => {
  const f = fixture();
  const order = await f.service.create('player', input);
  f.chain.status = async () => { throw new Error('RPC unavailable'); };
  await assert.rejects(() => f.replica.get('player', order.id), /RPC/);
  const stored = JSON.parse((await f.redis.get(`ripsy:shop:order:${order.id}`))!);
  assert.equal(stored.order.status, 'prepared');
  assert.equal(f.prepares(), 1);
});

test('BONK/Jup prices are fixed, mainnet-only and cannot be overridden by clients', async () => {
  const f = fixture();
  const mainnet = { ...config, cluster: 'mainnet-beta' as const };
  const service = new ShopService(f.redis, mainnet, f.chain);
  const catalog = parseShopCatalog(service.catalog());
  assert.deepEqual(service.catalog(1).figures.map(figure => figure.id), ['fig2']);
  for (const id of ['bonk', 'jup'] as const) {
    const figure = catalog.figures.find(candidate => candidate.id === id)!;
    assert.equal(figure.available, true);
    assert.equal(figure.seekerExclusive, false);
    assert.deepEqual(figure.tokenPayment, FIGURE_TOKEN_PAYMENTS[id]);
    const input = { figureId: id, buyer, idempotencyKey: `fixed-payment-${id}-1234`, priceLamports: '1', tokenPayment: { amount: '1' } };
    const order = await service.create('player', input);
    assert.equal(order.priceLamports, '0');
    assert.deepEqual(order.tokenPayment, FIGURE_TOKEN_PAYMENTS[id]);
    assert.equal(figurePaymentPrice(order, order.cluster), id === 'bonk' ? '6,900,000 BONK' : '99 JUP');
    assert.equal(figurePurchaseTotal(order), id === 'bonk' ? '6,900,000 BONK + 0.000015 SOL' : '99 JUP + 0.000015 SOL');
    assert.deepEqual(await service.create('player', input), order);
    await assert.rejects(() => f.service.create('player', input), /production store/);
    assert.equal(shopCatalog(config).figures.find(candidate => candidate.id === id)!.available, false);
    const tampered = structuredClone(catalog);
    tampered.figures.find(candidate => candidate.id === id)!.tokenPayment!.amount = '1';
    assert.throws(() => parseShopCatalog(tampered), /Invalid shop figure/);
  }
});
