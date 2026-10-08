// Diagnostic session only. Never signs, submits or creates a paid transaction.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = 'https://api.ripsy.fun';
const expectEnabled = process.argv.includes('--enabled');
const get = (path, options = {}) => fetch(`${origin}${path}`, {
  ...options, signal: AbortSignal.timeout(15000),
});
let stage = 'health';
try {
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).redis, 'connected');
  stage = 'authentication';
  assert.equal((await get('/shop/packs/catalog')).status, 401);
  stage = 'diagnostic-session';
  const session = await get('/session', { method: 'POST' });
  assert.equal(session.status, 201);
  const { token } = await session.json();
  assert.equal(typeof token, 'string');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  stage = 'catalog';
  const response = await get('/shop/packs/catalog', { headers });
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.available, expectEnabled, 'Catalog does not match the requested activation state');
  assert.equal(catalog.version, 1);
  assert.equal(catalog.payment.amount, '1099000000');
  assert.equal(catalog.payment.mint, 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
  assert.deepEqual(catalog.drops, [
    { figureId: 'jup', weight: 500000 }, { figureId: 'bonk', weight: 500000 },
  ]);
  // Enabled mode is strictly read-only apart from the diagnostic session.
  // Never attempt a real order during an operator health check.
  if (!expectEnabled) {
    stage = 'blocked-purchase';
    const blocked = await get('/shop/packs/orders', { method: 'POST', headers,
      body: JSON.stringify({ buyer: 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh',
        idempotencyKey: `readiness-${randomUUID()}` }),
    });
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).error, 'Packs are not available yet.');
  }
  stage = 'legacy-catalog';
  const legacy = await get('/shop/catalog');
  assert.equal(legacy.status, 200);
  assert.deepEqual((await legacy.json()).figures.map(f => f.id), ['fig2']);
  stage = 'modern-catalog';
  const modern = await get('/shop/catalog?catalogVersion=2');
  assert.equal(modern.status, 200);
  assert.deepEqual((await modern.json()).figures.map(f => f.id), ['fig2', 'bonk', 'jup']);
  console.log(JSON.stringify({ healthy: true, authenticationRequired: true,
    packPurchasesBlocked: !catalog.available, priceAndWeightsMatch: true, legacyCatalogCompatible: true,
    paidTransactionCreated: false }));
} catch (error) {
  console.error(JSON.stringify({ failedStage: stage, errorType: error?.name,
    noTransactionSignedOrSubmitted: true }));
  process.exitCode = 1;
}
