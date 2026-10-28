import assert from 'node:assert/strict';
import test from 'node:test';
import { loadShopConfig, shopCatalog, type ShopConfig } from './shop-config.js';
import { ShopError, ShopService, type ShopRedis } from './shop-service.js';
import type { ShopChain } from './shop-chain.js';
import { FIGURE_TOKEN_PAYMENTS, figurePaymentPrice, figurePurchaseTotal, formatSol, parseShopCatalog } from '@rps/core/shop';
import { FIGURES as REGISTERED_FIGURES } from './figure-registry.js';

const buyer = '11111111111111111111111111111111';
const config: ShopConfig = { ...loadShopConfig({}), cluster: 'mainnet-beta', enabled: true, treasury: 'So11111111111111111111111111111111111111112', collection: 'SysvarRent111111111111111111111111111111111', prices: { fig1: '100000000', fig2: '200000000' } };
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
    if (script.includes('PREPARED_ORDER_FENCE')) {
      if (this.data.get(key) !== options.arguments[0] || this.data.has(options.keys[1]!)) return 0;
      this.data.set(options.keys[1]!, options.arguments[1]!); return 1;
    }
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

test('new player can reconcile only the exact receipt; no ownership, order write, prepare or send', async () => {
  const f = fixture(); const order = await f.service.create('old-player', input);
  const key = `ripsy:shop:order:${order.id}`; const original = await f.redis.get(key);
  const calls: unknown[] = [];
  f.chain.status = async (snapshot, finality) => { calls.push(finality); snapshot.signature = '1'.repeat(64); return 'confirmed'; };
  const result = await f.service.reconcile('new-player', order.id, { transaction: order.transaction });
  assert.equal(result.status, 'confirmed'); assert.equal(result.signature, '1'.repeat(64));
  assert.deepEqual(calls, ['finalized']); assert.equal(await f.redis.get(key), original);
  assert.equal(f.prepares(), 1); assert.equal(f.sends(), 0);
  await assert.rejects(f.service.get('new-player', order.id), /not found/);
  await assert.rejects(f.service.submit('new-player', order.id, 'signed'), /not found/);
  assert.equal(f.sends(), 0);
});

test('reconciliation of saved signed bytes only derives the original signature and never broadcasts', async () => {
  const f = fixture(); const order = await f.service.create('old-player', input);
  const key = `ripsy:shop:order:${order.id}`; const original = await f.redis.get(key);
  const checked = await f.service.reconcile('new-player', order.id, { transaction: order.transaction, signed: 'signed' });
  assert.equal(checked.status, 'submitted'); assert.equal(checked.signature, '1'.repeat(64));
  assert.equal(f.sends(), 0); assert.equal(await f.redis.get(key), original);
  for (const state of ['failed', 'expired'] as const) {
    f.setState(state);
    assert.equal((await f.service.reconcile('new-player', order.id, { transaction: order.transaction, signed: 'signed' })).status, state);
    assert.equal(await f.redis.get(key), original); assert.equal(f.sends(), 0);
  }
});

test('reconciling an already-submitted stored payment never calls the rebroadcasting refresh path', async () => {
  const f = fixture(); const order = await f.service.create('old-player', input);
  const key = `ripsy:shop:order:${order.id}`;
  const original = JSON.stringify({ playerId: 'old-player', order: { ...order, status: 'submitted', signature: '1'.repeat(64) }, signed: 'signed' });
  await f.redis.set(key, original);
  const result = await f.service.reconcile('new-player', order.id, { transaction: order.transaction });
  assert.equal(result.status, 'submitted'); assert.equal(result.signature, '1'.repeat(64));
  assert.equal(await f.redis.get(key), original); assert.equal(f.sends(), 0); assert.equal(f.prepares(), 1);
});

test('bad or missing receipt, signature, network and ambiguous RPC fail closed', async () => {
  const f = fixture(); const order = await f.service.create('old-player', input);
  const key = `ripsy:shop:order:${order.id}`; const original = await f.redis.get(key);
  let calls = 0; f.chain.status = async () => { calls++; throw new Error('RPC unavailable'); };
  for (const transaction of [undefined, '', 'different', 'x'.repeat(1645)]) {
    await assert.rejects(f.service.reconcile('new-player', order.id, { transaction }), /not found/);
  }
  await assert.rejects(f.service.reconcile('new-player', 'b'.repeat(64), { transaction: order.transaction }), /not found/);
  await assert.rejects(f.service.reconcile('new-player', order.id, { transaction: order.transaction, signed: 'wrong' }), /signature/);
  assert.equal(calls, 0);
  await assert.rejects(f.service.reconcile('new-player', order.id, { transaction: order.transaction }), /RPC unavailable/);
  assert.equal(await f.redis.get(key), original); assert.equal(f.sends(), 0);
  await f.redis.set(key, JSON.stringify({ playerId: 'old-player', order: { ...order, cluster: 'devnet' } }));
  await assert.rejects(f.service.reconcile('new-player', order.id, { transaction: order.transaction }), /different network/);
  assert.equal(calls, 1);
});

test('read-only reconciliation is rate limited independently of preparing a new purchase', async () => {
  const f = fixture(); const order = await f.service.create('old-player', input);
  for (let n = 0; n < 30; n++) await f.service.reconcile('new-player', order.id, { transaction: order.transaction });
  await assert.rejects(f.service.reconcile('new-player', order.id, { transaction: order.transaction }), (e: unknown) => e instanceof ShopError && e.status === 429);
  await assert.rejects(f.service.reconcile('another-player', order.id, { transaction: order.transaction }), (e: unknown) => e instanceof ShopError && e.status === 429);
  assert.equal(f.prepares(), 1); assert.equal(f.sends(), 0);
});

test('shop is disabled by default; no invented prices and no signing secrets in catalog', () => {
  const defaults = loadShopConfig({ SHOP_MINT_AUTHORITY_SECRET: 'not-public' });
  const catalog = shopCatalog(defaults);
  assert.equal(catalog.cluster, 'devnet');
  assert.ok(catalog.figures.every(figure => !figure.available));
  assert.equal(catalog.figures[0]!.priceLamports, '0');
  assert.deepEqual(catalog.figures[0]!.tokenPayment, FIGURE_TOKEN_PAYMENTS.fig2);
  assert.deepEqual(catalog.figures.map(figure => figure.id), REGISTERED_FIGURES.filter(f => f.purchasable).map(f => f.id));
  assert.ok(!JSON.stringify(catalog).includes('not-public'));
  assert.ok(!JSON.stringify(shopCatalog(loadShopConfig({ JUPITER_API_KEY: 'server-only-test-key' }))).includes('server-only-test-key'));
  assert.throws(() => loadShopConfig({ SHOP_ENABLED: 'true' }), /incomplete/);
  for (const price of ['10000000', '0', '-1', '0.1', '1e9']) assert.equal(loadShopConfig({ SHOP_FIG2_PRICE_LAMPORTS: price }).prices.fig2, null);
  assert.equal(formatSol('1'), '0.000000001 SOL');
  assert.equal(formatSol('1200000000'), '1.2 SOL');
  assert.equal(loadShopConfig({ SOLANA_RPC_URL: 'https://mainnet.example.test' }).seekerRpcUrl, 'https://mainnet.example.test');
});

test('prices are server owned and idempotency survives switching replicas', async () => {
  const f = fixture();
  const first = await f.service.create('player', { ...input, priceLamports: '1' });
  const repeated = await f.replica.create('player', input);
  assert.deepEqual(first, repeated);
  assert.equal(first.priceLamports, '0');
  assert.deepEqual(first.tokenPayment, FIGURE_TOKEN_PAYMENTS.fig2);
  assert.equal(f.prepares(), 1);
  await assert.rejects(() => f.replica.create('player', { ...input, buyer: 'SysvarC1ock11111111111111111111111111111111' }), /already used/);
});

test('quantity multiplies the server quote once, creates separate assets and pins idempotency across replicas', async () => {
  const f = fixture(); const assets = [buyer, FIGURE_TOKEN_PAYMENTS.bonk!.mint, FIGURE_TOKEN_PAYMENTS.jup!.mint];
  const original = f.chain.prepare; const calls: unknown[][] = [];
  f.chain.prepare = async (...args) => { calls.push(args); return { ...await original(...args), assets }; };
  const request = { ...input, quantity: 3, amount: '1', tokenPayment: { amount: '1' } };
  const first = await f.service.create('player', request);
  assert.equal(first.quantity, 3); assert.deepEqual(first.assets, assets);
  assert.equal(first.tokenPayment!.amount, (BigInt(FIGURE_TOKEN_PAYMENTS.fig2!.amount) * 3n).toString());
  assert.deepEqual(calls[0], ['fig2', buyer, '0', first.tokenPayment, undefined, 3]);
  assert.deepEqual(await f.replica.create('player', request), first);
  await assert.rejects(f.replica.create('player', { ...request, quantity: 2 }), /already used/);
  await assert.rejects(f.replica.create('player', input), /already used/);
  assert.equal(calls.length, 1); assert.equal(f.sends(), 0);
  f.setState('confirmed'); const done = await f.replica.get('player', first.id);
  assert.deepEqual(done.assets, assets); assert.equal(done.quantity, 3);
});
test('bad quantity and incomplete or duplicate prepared assets never produce a purchase', async () => {
  for (const quantity of [0, 4, 14, -1, 1.5, '2', null, {}, Number.MAX_SAFE_INTEGER]) {
    const f = fixture(); await assert.rejects(f.service.create('player', { ...input, quantity }), /between 1 and 3/);
    assert.equal(f.prepares(), 0); assert.equal(f.sends(), 0);
  }
  for (const assets of [undefined, [buyer], [buyer, buyer]]) {
    const f = fixture(); const original = f.chain.prepare;
    f.chain.prepare = async (...args) => ({ ...await original(...args), assets });
    await assert.rejects(f.service.create('player', { ...input, quantity: 2 }), /all selected figures/);
    assert.equal([...f.redis.data.keys()].some(key => key.includes(':order:')), false);
  }
});
test('bulk SOL recovery uses the full token total and never changes quantity after preparation', async () => {
  const f = fixture(); const original = f.chain.prepare; const assets = [buyer, FIGURE_TOKEN_PAYMENTS.bonk!.mint];
  f.chain.prepare = async (...args) => {
    assert.equal(args[5], 2); assert.equal(args[3]!.amount, '2000000');
    if (!args[4]) throw new ShopError('Not enough SKR', 400, { code: 'INSUFFICIENT_PURCHASE_TOKEN', ...args[3]!, required: args[3]!.amount, balance: '1000000' });
    return { ...await original(...args), assets };
  };
  const request = { ...input, quantity: 2 };
  await assert.rejects(f.service.create('player', request), (error: unknown) => error instanceof ShopError && error.recovery?.required === '2000000');
  const order = await f.replica.create('player', { ...request, paymentMode: 'sol' });
  assert.equal(order.quantity, 2); assert.equal(order.tokenPayment!.amount, '2000000');
  assert.deepEqual(await f.service.create('player', request), order);
});

test('SOL recovery forwards only the payment mode and preserves prepared orders on retry', async () => {
  const f = fixture(), original = f.chain.prepare;
  const calls: unknown[][] = [];
  f.chain.prepare = async (...args) => {
    calls.push(args);
    if (!args[4]) throw new ShopError('Insufficient tokens', 409, { code: 'INSUFFICIENT_PURCHASE_TOKEN', ...FIGURE_TOKEN_PAYMENTS.fig2!, required: FIGURE_TOKEN_PAYMENTS.fig2!.amount, balance: '0' });
    return original(...args);
  };
  await assert.rejects(f.service.create('player', input), /Insufficient/);
  assert.equal([...f.redis.data.keys()].some(k => k.includes(':order:')), false);
  const order = await f.replica.create('player', { ...input, paymentMode: 'sol', mint: buyer, amount: '1', slippageBps: 9999 });
  assert.deepEqual(calls[1], ['fig2', buyer, '0', FIGURE_TOKEN_PAYMENTS.fig2, 'sol']);
  assert.deepEqual(await f.service.create('player', input), order);
  assert.equal(calls.length, 2);
  assert.equal(f.sends(), 0);
  await assert.rejects(f.service.create('player', { ...input, paymentMode: 'arbitrary' }), /Invalid payment method/);
});

test('legacy SOL Seeker purchases recover their exact original quote/bytes after the SKR switch', async () => {
  const f = fixture(); const prepared = await f.service.create('player', input);
  const key = `ripsy:shop:order:${prepared.id}`;
  const stored = JSON.parse(f.redis.data.get(key)!);
  stored.order.priceLamports = '10000000'; delete stored.order.tokenPayment;
  stored.order.transaction = 'original-partially-signed-SOL-transaction';
  f.redis.data.set(key, JSON.stringify(stored));
  assert.deepEqual(await f.replica.create('player', input), stored.order);
  assert.deepEqual(await f.replica.get('player', prepared.id), stored.order);
  f.chain.validateSigned = (order, signed) => { assert.equal(order.transaction, stored.order.transaction);
    assert.equal(signed, 'signed-original-SOL-transaction'); return '1'.repeat(64); };
  const send = f.chain.send; const broadcasts: string[] = [];
  f.chain.send = async signed => { const saved = JSON.parse(f.redis.data.get(key)!);
    assert.equal(saved.order.priceLamports, '10000000'); assert.equal(saved.order.tokenPayment, undefined);
    broadcasts.push(signed); await send(signed); };
  assert.equal((await f.replica.submit('player', prepared.id, 'signed-original-SOL-transaction')).status, 'submitted');
  f.setState('confirmed'); assert.equal((await f.replica.get('player', prepared.id)).status, 'confirmed');
  assert.equal(f.prepares(), 1); assert.ok(broadcasts.length > 0);
  assert.ok(broadcasts.every(bytes => bytes === 'signed-original-SOL-transaction')); // Identical-byte recovery, not a second purchase.
  stored.order.cluster = 'devnet'; stored.order.status = 'confirmed'; f.redis.data.set(key, JSON.stringify(stored));
  assert.deepEqual(await new ShopService(f.redis, { ...config, cluster: 'devnet' }, f.chain).create('player', input), stored.order);
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

test('a late quote after lease expiry cannot overwrite or return an obsolete purchase', async () => {
  const f = fixture(), original = f.chain.prepare;
  let first = true;
  f.chain.prepare = async (...args) => {
    if (first) {
      first = false;
      const lock = [...f.redis.data.keys()].find(k => k.includes(':lock:'))!;
      f.redis.data.delete(lock); // Simulate expiry while an RPC/quote was slow.
      await f.replica.create('player', { ...input, paymentMode: 'sol' });
    }
    return original(...args);
  };
  await assert.rejects(f.service.create('player', input), /updating/);
  const saved = await f.replica.create('player', input);
  assert.equal(saved.status, 'prepared'); assert.equal(f.prepares(), 2);
  assert.equal(f.sends(), 0);
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

test('new SKR figures use authoritative 450-SKR quotes, stay out of legacy catalogs and reject client prices', async () => {
  const f = fixture();
  const all = await f.service.liveCatalog(4);
  for (const [id, variant] of [['alien', 6], ['robot', 7], ['skull', 8]] as const) {
    const product = all.figures.find(figure => figure.id === id)!;
    assert.equal(product.variant, variant); assert.equal(product.seekerExclusive, false);
    const receipt = await f.service.create('player', { figureId: id, buyer, idempotencyKey: `new-skr-${id}-123456`, tokenPayment: { amount: '1' }, priceLamports: '1' });
    assert.equal(receipt.tokenPayment!.amount, '450000000');
    assert.equal(figurePaymentPrice(receipt, 'mainnet-beta'), '450 SKR');
    for (const version of [1, 2, 3]) assert.ok(!(await f.service.liveCatalog(version)).figures.some(figure => figure.id === id));
  }
});

test('BONK/Jup/ORE prices are fixed, mainnet-only and cannot be overridden by clients', async () => {
  const f = fixture();
  const mainnet = { ...config, cluster: 'mainnet-beta' as const };
  const service = new ShopService(f.redis, mainnet, f.chain);
  const catalog = parseShopCatalog(service.catalog());
  assert.deepEqual(service.catalog(1).figures.map(figure => figure.id), ['fig2']);
  assert.deepEqual(service.catalog(2).figures.map(figure => figure.id), ['fig2', 'bonk', 'jup']);
  assert.deepEqual(catalog.figures.map(figure => figure.id), ['fig2', 'bonk', 'jup', 'ore']);
  const prices = { bonk: '6,900,000 BONK', jup: '99 JUP', ore: '0.25 ORE' };
  for (const id of ['bonk', 'jup', 'ore'] as const) {
    const figure = catalog.figures.find(candidate => candidate.id === id)!;
    assert.equal(figure.available, true);
    assert.equal(figure.seekerExclusive, false);
    assert.deepEqual(figure.tokenPayment, FIGURE_TOKEN_PAYMENTS[id]);
    const input = { figureId: id, buyer, idempotencyKey: `fixed-payment-${id}-1234`, priceLamports: '1', tokenPayment: { amount: '1' } };
    const order = await service.create('player', input);
    assert.equal(order.priceLamports, '0');
    assert.deepEqual(order.tokenPayment, FIGURE_TOKEN_PAYMENTS[id]);
    assert.equal(figurePaymentPrice(order, order.cluster), prices[id]);
    assert.equal(figurePurchaseTotal(order), `${prices[id]} + 0.000015 SOL`);
    assert.deepEqual(await service.create('player', input), order);
    await assert.rejects(() => new ShopService(f.redis, { ...config, cluster: 'devnet' }, f.chain).create('player', { ...input, idempotencyKey: `devnet-payment-${id}-1234` }), /production store/);
    assert.equal(shopCatalog({ ...config, cluster: 'devnet' }).figures.find(candidate => candidate.id === id)!.available, false);
    const tampered = structuredClone(catalog);
    tampered.figures.find(candidate => candidate.id === id)!.tokenPayment!.amount = '1';
    // A structurally valid server price can change without a mobile release.
    assert.equal(parseShopCatalog(tampered).figures.find(candidate => candidate.id === id)!.tokenPayment!.amount, '1');
    for (const field of ['mint', 'decimals', 'symbol'] as const) {
      const bad = structuredClone(catalog);
      const payment = bad.figures.find(candidate => candidate.id === id)!.tokenPayment!;
      if (field === 'decimals') payment.decimals = 19;
      else payment[field] = field === 'symbol' ? 'bad symbol' : 'invalid';
      assert.throws(() => parseShopCatalog(bad), /Invalid shop figure/);
    }
  }
});
