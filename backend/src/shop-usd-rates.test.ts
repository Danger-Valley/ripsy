import assert from 'node:assert/strict';
import test from 'node:test';
import { PACK_PAYMENT } from '@rps/core/packs';
import { FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import { ShopUsdRatesService, SOL_PRICE_MINT } from './shop-usd-rates.js';
import type { ShopRedis } from './shop-service.js';

class MemoryRedis implements ShopRedis {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); return 'OK';
  }
  async eval(_script: string, { keys, arguments: args }: { keys: string[]; arguments: string[] }) {
    if (this.data.get(keys[0]!) === args[0]) this.data.delete(keys[0]!);
    return 1;
  }
}
const row = (usdPrice: unknown = 100, decimals: unknown = 9, blockId: unknown = 1000) => ({ usdPrice, decimals, blockId });
test('USD feed batches allowlisted mints, validates decimals and never leaks provider fields/key', async () => {
  const redis = new MemoryRedis(); let calls = 0;
  const service = new ShopUsdRatesService(redis, 'server-only-key', 'test', async (url, init) => {
    calls++; assert.equal(new URL(String(url)).origin, 'https://api.jup.ag');
    const mints = new URL(String(url)).searchParams.get('ids')!.split(',');
    assert.deepEqual(new Set(mints), new Set([SOL_PRICE_MINT, PACK_PAYMENT.mint, ...Object.values(FIGURE_TOKEN_PAYMENTS).map(t => t!.mint)]));
    assert.equal((init!.headers as Record<string, string>)['x-api-key'], 'server-only-key'); assert.ok(init!.signal);
    return Response.json({ [SOL_PRICE_MINT]: { ...row(), extra: 'secret' }, [PACK_PAYMENT.mint]: row(0.016, 6),
      [FIGURE_TOKEN_PAYMENTS.ore!.mint]: row(107, 11), arbitrary: row() });
  });
  const [first, second] = await Promise.all([service.get(), service.get()]);
  assert.equal(calls, 1); assert.deepEqual(first, second); assert.equal(first.rates[SOL_PRICE_MINT]!.usdPrice, 100);
  assert.equal(first.rates[PACK_PAYMENT.mint]!.usdPrice, 0.016); assert.equal(first.rates[FIGURE_TOKEN_PAYMENTS.ore!.mint]!.decimals, 11);
  assert.equal(first.rates.arbitrary, undefined); assert.ok(first.fetchedAt); assert.equal(first.expiresAt - first.fetchedAt!, 60_000);
  assert.ok(!JSON.stringify(first).includes('secret')); assert.ok(!JSON.stringify(first).includes('server-only-key'));
  const replica = new ShopUsdRatesService(redis, undefined, 'test', async () => { throw new Error('Must use shared cache'); });
  assert.deepEqual(await replica.get(), first); assert.equal(calls, 1);
});
test('keyless feed rejects absent, invalid, zero, negative and wrong-precision prices without inventing rates', async () => {
  for (const value of [null, row(0), row(-1), row('100'), row(100, 6), row(100, 9, -1), row(100, 9, 1.5)]) {
    const service = new ShopUsdRatesService(new MemoryRedis(), undefined, 'test', async (_url, init) => {
      assert.deepEqual(init!.headers, {}); return Response.json({ [SOL_PRICE_MINT]: value });
    });
    const result = await service.get(); assert.deepEqual(result.rates, {}); assert.ok(result.error);
  }
});
test('expired rates are not reused; provider failures are bounded, cached briefly and safe', async () => {
  const redis = new MemoryRedis(); let fail = false; let calls = 0;
  const service = new ShopUsdRatesService(redis, undefined, 'test', async () => {
    calls++; if (fail) return new Response('private upstream credentials', { status: 429 });
    return Response.json({ [SOL_PRICE_MINT]: row() });
  });
  await service.get();
  for (const [key, value] of redis.data) redis.data.set(key, JSON.stringify({ ...JSON.parse(value), expiresAt: Date.now() - 1 }));
  fail = true;
  const result = await service.get(); assert.equal(calls, 2); assert.deepEqual(result.rates, {}); assert.equal(result.fetchedAt, null);
  assert.ok(!JSON.stringify(result).includes('credentials')); await service.get(); assert.equal(calls, 2);
});
test('replica lock prevents parallel provider calls and unavailable rates never block price management', async () => {
  const redis = new MemoryRedis(); let release!: () => void; let calls = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const fetcher: typeof fetch = async () => { calls++; await barrier; return Response.json({ [SOL_PRICE_MINT]: row() }); };
  const service = new ShopUsdRatesService(redis, undefined, 'test', fetcher);
  const replica = new ShopUsdRatesService(redis, undefined, 'test', fetcher);
  const waiting = service.get();
  while (!calls) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await replica.get()).rates, {}); assert.equal(calls, 1);
  release(); await waiting; assert.equal((await replica.get()).rates[SOL_PRICE_MINT]!.usdPrice, 100);
});
