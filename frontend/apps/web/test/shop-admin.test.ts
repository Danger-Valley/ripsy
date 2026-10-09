import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRequest, AdminApiError, chanceWeight, changedPrices, usdEstimate, SOL_PRICE_MINT } from '../app/admin/shop/admin-client';
import type { AdminFigure, AdminUsdRates } from '@rps/core/shop-admin';
const figures: AdminFigure[] = [{ id: 'ore', name: 'ORE', imageUrl: '', symbol: 'ORE', decimals: 11, mint: 'oreo', price: '0.25', amount: '25000000000', packEligible: true }];
test('USD is a display-only estimate for SOL and arbitrary token amounts, including small BONK rates', () => {
  const rates: AdminUsdRates = { source: 'Jupiter', fetchedAt: 1000, expiresAt: 61000, error: null,
    rates: { [SOL_PRICE_MINT]: { usdPrice: 110, decimals: 9, blockId: 1000 }, bonk: { usdPrice: 0.0000033, decimals: 5, blockId: 1000 },
      skr: { usdPrice: 0.016, decimals: 6, blockId: 1000 }, oreo: { usdPrice: 107, decimals: 11, blockId: 1000 } } };
  assert.equal(usdEstimate('0.01', null, 9, rates, 1000), '≈ $1.10 USD');
  assert.equal(usdEstimate('6900000', 'bonk', 5, rates, 1000), '≈ $22.77 USD');
  assert.equal(usdEstimate('1099', 'skr', 6, rates, 1000), '≈ $17.58 USD');
  assert.equal(usdEstimate('0.25', 'oreo', 11, rates, 1000), '≈ $26.75 USD');
  assert.equal(usdEstimate('0.3', 'oreo', 11, rates, 1000), '≈ $32.10 USD');
  assert.equal(usdEstimate('1', 'bonk', 5, rates, 1000), '≈ < $0.01 USD');
  assert.equal(usdEstimate('1', 'missing', 6, rates, 1000), 'USD rate unavailable');
  assert.equal(usdEstimate('1', 'bonk', 6, rates, 1000), 'USD rate unavailable');
  assert.equal(usdEstimate('1', 'bonk', 5, rates, 61000), 'USD rate unavailable');
  assert.equal(usdEstimate('1', null, 9, null, 1000), 'USD rate unavailable');
  for (const invalid of ['', '0', '-1', 'NaN', '1e3', '6,900,000', '0.000000000001']) assert.match(usdEstimate(invalid, 'oreo', 11, rates, 1000), /valid price/);
});
test('price form validates exact precision, ignores unchanged values and preserves invalid edits', () => {
  assert.deepEqual(changedPrices(figures, { ore: '0.25000000000' }), { prices: {}, errors: {} });
  assert.deepEqual(changedPrices(figures, { ore: '0.3' }).prices, { ore: '0.3' });
  assert.ok(changedPrices(figures, { ore: '0.000000000001' }).errors.ore);
  assert.equal(chanceWeight('40'), 400000); assert.equal(chanceWeight('0.0001'), 1); assert.equal(chanceWeight('0'), 0);
  for (const bad of ['-1', '100.0001', '0.00001', '1e2', 'NaN']) assert.throws(() => chanceWeight(bad));
});
test('admin API uses memory-provided bearer tokens, no-store and typed authentication failures', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith('/shop/admin/prices')); assert.equal(init!.cache, 'no-store');
    assert.equal((init!.headers as Record<string, string>).authorization, 'Bearer ephemeral-token');
    assert.equal(init!.method, 'PUT'); assert.deepEqual(JSON.parse(init!.body as string), { revision: 1 });
    return new Response(JSON.stringify({ error: 'Admin session expired. Sign in again.' }), { status: 401 });
  };
  await assert.rejects(() => adminRequest('prices', 'ephemeral-token', 'PUT', { revision: 1 }), error => error instanceof AdminApiError && error.status === 401);
});
