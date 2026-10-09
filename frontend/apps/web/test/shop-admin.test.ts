import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRequest, AdminApiError, chanceWeight, changedPrices } from '../app/admin/shop/admin-client';
import type { AdminFigure } from '@rps/core/shop-admin';
const figures: AdminFigure[] = [{ id: 'ore', name: 'ORE', imageUrl: '', symbol: 'ORE', decimals: 11, mint: 'oreo', price: '0.25', amount: '25000000000', packEligible: true }];
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
