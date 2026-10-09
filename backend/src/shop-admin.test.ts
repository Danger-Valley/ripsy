import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner } from '@metaplex-foundation/umi';
import { createSignInMessage } from '@solana/wallet-standard-util';
import { decimalToUnits, unitsToDecimal, type AdminPublication } from '@rps/core/shop-admin';
import { INITIAL_PACK, PACK_PAYMENT } from '@rps/core/packs';
import { parseShopCatalog } from '@rps/core/shop';
import { ShopAdminAuth } from './shop-admin-auth.js';
import { ShopAdminService } from './shop-admin.js';
import { handleShopAdmin } from './shop-admin-http.js';
import { ShopPricingService } from './shop-pricing.js';
import { loadShopConfig } from './shop-config.js';
import { ShopService, ShopError, type ShopRedis } from './shop-service.js';
import type { ShopChain } from './shop-chain.js';
import { WalletVerificationService } from './wallet-verification.js';
import { parseAdminPackDraft, type PackAdminChain } from './pack-admin-chain.js';

class MemoryRedis implements ShopRedis {
  data = new Map<string, string>();
  expiry = new Map<string, number>();
  async get(key: string) { if ((this.expiry.get(key) ?? Infinity) <= Date.now()) this.data.delete(key); return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); if (options?.EX) this.expiry.set(key, Date.now() + options.EX * 1000); return 'OK';
  }
  async eval(script: string, { keys, arguments: args }: { keys: string[]; arguments: string[] }) {
    const key = keys[0]!;
    if (script.includes('INCR')) { const n = Number(this.data.get(key) ?? 0) + 1; this.data.set(key, String(n)); return n; }
    if (script.includes('shop-price-cas')) {
      const revision = JSON.parse(this.data.get(key) ?? '{"revision":0}').revision;
      if (revision !== Number(args[0])) return 0;
      this.data.set(key, args[1]!); return 1;
    }
    if (args.length && this.data.get(key) !== args[0]) return 0;
    const old = this.data.get(key) ?? null; this.data.delete(key); return old;
  }
}
const umi = createUmi('http://127.0.0.1:8899');
const admin = generateSigner(umi); const other = generateSigner(umi);
const config = { ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta' as const,
  treasury: generateSigner(umi).publicKey, collection: generateSigner(umi).publicKey, prices: { fig1: null, fig2: '10000000' } };
const draft = { expectedVersion: 2, price: '1099', drops: [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }] };
async function proof(auth: ShopAdminAuth | WalletVerificationService, signer = admin, player = 'player') {
  const challenge = auth instanceof ShopAdminAuth ? await auth.challenge(player) : await auth.issue(player);
  const signedMessage = createSignInMessage({ ...challenge, address: signer.publicKey });
  return { nonce: challenge.nonce, address: signer.publicKey, signedMessage: [...signedMessage], signature: [...await signer.signMessage(signedMessage)] };
}
function fixture() {
  const redis = new MemoryRedis(); const pricing = new ShopPricingService(redis, config);
  const auth = new ShopAdminAuth(redis, config.publicOrigin, admin.publicKey);
  let state: AdminPublication['status'] = 'prepared'; let prepares = 0; let sends = 0; let activeVersion = 2;
  const chain: PackAdminChain = {
    async catalog() { return { ...INITIAL_PACK, available: true, version: activeVersion, drops: draft.drops }; },
    async prepare(catalog) {
      assert.equal(catalog.version, activeVersion + 1); prepares++;
      return { edition: other.publicKey, transaction: 'unsigned', lastValidBlockHeight: 100, networkFeeLamports: '46299040' };
    },
    validateSigned(_job, signed) { if (signed !== 'signed') throw new ShopError('Invalid signature'); return '1'.repeat(64); },
    async send(signed) { sends++; assert.equal(signed, 'signed'); },
    async status(job) { return state === 'prepared' && job.signature ? 'submitted' : state; },
  };
  const service = new ShopAdminService(redis, config, pricing, chain);
  return { redis, pricing, auth, chain, service, replica: new ShopAdminService(redis, config, pricing, chain), prepares: () => prepares, sends: () => sends,
    setState(value: typeof state) { state = value; }, setVersion(value: number) { activeVersion = value; } };
}

test('operator amounts are exact base units, including ORE precision and u64 limits', () => {
  assert.equal(decimalToUnits('0.25', 11), '25000000000');
  assert.equal(decimalToUnits('6900000', 5), '690000000000');
  assert.equal(decimalToUnits('1099', 6), PACK_PAYMENT.amount);
  assert.equal(unitsToDecimal('25000000000', 11), '0.25');
  assert.equal(decimalToUnits('18446744073709551615', 0), '18446744073709551615');
  for (const bad of ['0', '-1', 'NaN', '1e3', '1,099', '', '0.0000001', '18446744073709551616']) assert.throws(() => decimalToUnits(bad, 6));
});
test('admin is disabled without an explicit allowlist and rejects customer tokens', async () => {
  const f = fixture(); const disabled = new ShopAdminAuth(f.redis, config.publicOrigin, undefined);
  await assert.rejects(() => disabled.challenge('player'), /not enabled/);
  await assert.rejects(() => f.auth.authenticate('Bearer player-session'), /Sign in/);
  await assert.rejects(() => f.auth.authenticate(`Bearer ${'a'.repeat(64)}`), /expired/);
});
test('admin SIWS is scoped, consumes nonces once, enforces the exact wallet and never promotes customer proofs', async () => {
  const f = fixture(); const customer = new WalletVerificationService(f.redis, config.publicOrigin);
  await assert.rejects(async () => f.auth.verify('player', await proof(customer)), /expired or was already used/);
  await assert.rejects(async () => f.auth.verify('player', await proof(f.auth, other)), /not the shop administrator/);
  const p = await proof(f.auth); const session = await f.auth.verify('player', p);
  assert.equal(await f.auth.authenticate(`Bearer ${session.token}`), admin.publicKey);
  assert.ok(![...f.redis.data.keys()].some(k => k.includes(session.token)));
  assert.equal(await customer.address('player'), null);
  await assert.rejects(() => f.auth.verify('player', p), /already used/);
  await f.auth.logout(`Bearer ${session.token}`);
  await assert.rejects(() => f.auth.authenticate(`Bearer ${session.token}`), /expired/);
});
test('tampered messages, player mismatch, expired sessions and changed allowlists fail closed', async () => {
  const f = fixture(); const tampered = await proof(f.auth); tampered.signedMessage[0] = tampered.signedMessage[0]! ^ 1;
  await assert.rejects(() => f.auth.verify('player', tampered), /signature/);
  await assert.rejects(async () => f.auth.verify('another-player', await proof(f.auth)), /expired/);
  const s = await f.auth.verify('player', await proof(f.auth));
  const changed = new ShopAdminAuth(f.redis, config.publicOrigin, other.publicKey);
  await assert.rejects(() => changed.authenticate(`Bearer ${s.token}`), /expired/);
  const sessionKey = [...f.redis.data.keys()].find(k => k.includes(':admin:session:'))!;
  f.redis.expiry.set(sessionKey, 0);
  await assert.rejects(() => f.auth.authenticate(`Bearer ${s.token}`), /expired/);
});
test('global admin challenge limit cannot be bypassed by creating fresh player sessions', async () => {
  const f = fixture(); for (let i = 0; i < 30; i++) await f.auth.challenge(`anonymous-${i}`);
  await assert.rejects(() => f.auth.challenge('another-anonymous'), /Too many admin/);
});
test('live figure prices persist across replicas, protect currencies/free figure and keep an atomic audit', async () => {
  const f = fixture(); const before = await f.pricing.get(); assert.equal(before.revision, 0);
  const next = await f.pricing.save(admin.publicKey, { revision: 0, prices: { bonk: '7000000', jup: '100.25', ore: '0.3', fig2: '0.02' } });
  assert.equal(next.revision, 1); assert.equal(next.audit.length, 1);
  assert.deepEqual(next.audit[0]!.changes.ore, { before: '25000000000', after: '30000000000' });
  const replica = new ShopPricingService(f.redis, config);
  const catalog = parseShopCatalog(await replica.catalog());
  assert.equal(catalog.figures.find(f => f.id === 'jup')!.tokenPayment!.amount, '100250000');
  assert.equal(catalog.figures.find(f => f.id === 'fig2')!.priceLamports, '20000000');
  for (const prices of [{ fig1: '1' }, { unknown: '1' }, { ore: '0.000000000001' }, { jup: 'NaN' }, { fig2: '9007199.254740992' }]) await assert.rejects(() => replica.save(admin.publicKey, { revision: 1, prices }));
  await assert.rejects(() => replica.save(admin.publicKey, { revision: 0, prices: { jup: '2' } }), /another session/);
  assert.equal((await replica.get()).audit.length, 1);
});
test('two simultaneous saves cannot overwrite the same pricing revision', async () => {
  const f = fixture(); const replica = new ShopPricingService(f.redis, config);
  const results = await Promise.allSettled([f.pricing.save(admin.publicKey, { revision: 0, prices: { jup: '100' } }), replica.save(admin.publicKey, { revision: 0, prices: { jup: '200' } })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.pricing.get()).revision, 1);
});
test('order payment and chain use one fresh snapshot; saved requests keep the old quote after price updates', async () => {
  const f = fixture(); const calls: unknown[][] = [];
  const chain: ShopChain = { async prepare(...args) { calls.push(args); return { asset: other.publicKey, transaction: 'unsigned', lastValidBlockHeight: 100, networkFeeLamports: '5000' }; },
    validateSigned() { return '1'.repeat(64); }, async send() {}, async status() { return 'pending'; } };
  const shop = new ShopService(f.redis, config, chain, 'ripsy', undefined, f.pricing);
  const replica = new ShopService(f.redis, config, chain, 'ripsy', undefined, new ShopPricingService(f.redis, config));
  const input = { figureId: 'jup', buyer: other.publicKey, idempotencyKey: 'original-customer-request' };
  const old = await shop.create('customer', input);
  await f.pricing.save(admin.publicKey, { revision: 0, prices: { jup: '123.456789' } });
  assert.deepEqual(await replica.create('customer', input), old);
  const fresh = await replica.create('customer', { ...input, idempotencyKey: 'new-customer-request', tokenPayment: { amount: '1' } });
  assert.equal(old.tokenPayment!.amount, '99000000'); assert.equal(fresh.tokenPayment!.amount, '123456789');
  assert.deepEqual(calls[1]![3], fresh.tokenPayment); assert.equal(calls.length, 2);
  assert.equal((await replica.liveCatalog(4)).figures.find(f => f.id === 'jup')!.tokenPayment!.amount, '123456789');
});
test('pack drafts require exact 100% totals, unique unrestricted registry figures and positive SKR price', () => {
  assert.equal(parseAdminPackDraft(draft).version, 3);
  for (const bad of [ { ...draft, price: '0' }, { ...draft, price: '1.0000001' }, { ...draft, expectedVersion: 0 },
    { ...draft, drops: [{ figureId: 'jup', weight: 999999 }] }, { ...draft, drops: [{ figureId: 'fig2', weight: 1000000 }] },
    { ...draft, drops: [{ figureId: 'unregistered', weight: 1000000 }] }, { ...draft, drops: [{ figureId: 'jup', weight: 500000 }, { figureId: 'jup', weight: 500000 }] } ]) assert.throws(() => parseAdminPackDraft(bad));
});
test('publication preparation is idempotent across replicas; invalid drafts never touch RPC', async () => {
  const f = fixture(); const input = { ...draft, requestId: 'publication-request-1234' };
  const job = await f.service.prepare(admin.publicKey, input);
  assert.equal(job.status, 'prepared'); assert.equal(f.sends(), 0);
  assert.deepEqual(await f.replica.prepare(admin.publicKey, input), job); assert.equal(f.prepares(), 1);
  await assert.rejects(() => f.service.prepare(admin.publicKey, { ...input, price: '1000' }), /already used/);
  await assert.rejects(() => f.service.prepare(admin.publicKey, { ...input, requestId: 'another-request-1234', drops: [] }), /chances/);
  await assert.rejects(() => f.service.get(other.publicKey, job.id), /not found/);
  assert.equal(f.prepares(), 1);
});
test('publication signed bytes persist before broadcast; another replica recovers ambiguous RPC without replacing the edition', async () => {
  const f = fixture(); const job = await f.service.prepare(admin.publicKey, { ...draft, requestId: 'publication-request-1234' });
  f.chain.send = async () => {
    const saved = JSON.parse(f.redis.data.get(`ripsy:shop:admin:publication:${job.id}`)!);
    assert.equal(saved.signed, 'signed'); assert.equal(saved.job.status, 'submitted'); throw new Error('Response lost');
  };
  await assert.rejects(() => f.service.submit(admin.publicKey, job.id, 'tampered'), /signature/);
  assert.equal((await f.service.submit(admin.publicKey, job.id, 'signed')).status, 'submitted');
  f.setState('confirmed'); assert.equal((await f.replica.get(admin.publicKey, job.id)).status, 'confirmed');
  assert.equal((await f.replica.submit(admin.publicKey, job.id, 'signed')).status, 'confirmed'); assert.equal(f.prepares(), 1);
});
test('expired publications cannot be resubmitted and pack RPC errors never hide figure pricing', async () => {
  const f = fixture(); const job = await f.service.prepare(admin.publicKey, { ...draft, requestId: 'publication-request-1234' });
  f.setState('expired'); assert.equal((await f.service.submit(admin.publicKey, job.id, 'signed')).status, 'expired'); assert.equal(f.sends(), 0);
  f.chain.catalog = async () => { throw new Error('RPC with secret data'); };
  const snapshot = await f.service.snapshot(); assert.equal(snapshot.pack, null); assert.ok(!snapshot.packError!.includes('secret data')); assert.equal(snapshot.prices.figures.length, 4);
});
test('real admin HTTP boundary requires wallet proof, not customer bearer tokens, for every mutation', async t => {
  const f = fixture();
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    try {
      await handleShopAdmin(request, response, request.url!, { auth: f.auth, service: f.service, prices: f.pricing,
        verifyPlayer: token => { if (token !== 'Bearer player-session') throw new ShopError('Invalid player session', 401); return 'player'; },
        async readBody(req) { let raw = ''; for await (const chunk of req) raw += chunk; return JSON.parse(raw); },
      });
    } catch (error) { response.writeHead(error instanceof ShopError ? error.status : 503).end(JSON.stringify({ error: (error as Error).message })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = (server.address() as { port: number }).port;
  const request = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:${port}/shop/admin/${path}`, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('settings')).status, 401);
  assert.equal((await request('prices', 'player-session', 'PUT', { revision: 0, prices: { jup: '1' } })).status, 401);
  assert.equal((await request('publications', 'player-session', 'POST', { ...draft, requestId: 'publication-request-1234' })).status, 401);
  const challenge = await (await request('challenge', 'player-session', 'POST')).json();
  const message = createSignInMessage({ ...challenge, address: admin.publicKey });
  const verified = await request('verify', 'player-session', 'POST', { address: admin.publicKey, nonce: challenge.nonce, signedMessage: [...message], signature: [...await admin.signMessage(message)] });
  assert.equal(verified.status, 200); const s = await verified.json();
  assert.equal((await request('settings', s.token)).status, 200);
  assert.equal((await request('prices', s.token, 'PUT', { revision: 0, prices: { jup: '100' } })).status, 200);
  assert.equal((await request('session', s.token, 'DELETE')).status, 204);
  assert.equal((await request('settings', s.token)).status, 401);
});
