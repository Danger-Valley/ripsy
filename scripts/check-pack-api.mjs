// Diagnostic session only. Never signs, submits or creates a paid transaction.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const origin = 'https://api.ripsy.fun';
const expectEnabled = process.argv.includes('--enabled');
const backend = process.argv.includes('--backend');
const expectedEdition = JSON.parse(readFileSync(new URL('../onchain/pack-config.json', import.meta.url), 'utf8'));
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
  if (backend) {
    assert.equal(catalog.engine, 'backend');
    assert.ok(Number.isSafeInteger(catalog.version) && catalog.version >= 1);
  } else assert.equal(catalog.version, expectedEdition.version);
  if (process.argv.includes('--buyer-funded')) assert.equal(catalog.deliveryPayment, 'buyer-prepaid');
  assert.match(catalog.payment.amount, /^[1-9]\d{0,15}$/);
  const expectedPrice = process.argv.find(a => a.startsWith('--price='))?.slice(8);
  if (expectedPrice) assert.equal(catalog.payment.amount, expectedPrice);
  assert.equal(catalog.payment.mint, 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
  if (backend) {
    assert.ok(Array.isArray(catalog.drops) && catalog.drops.length > 0);
    assert.equal(new Set(catalog.drops.map(drop => drop.figureId)).size, catalog.drops.length);
    assert.ok(catalog.drops.every(drop => Number.isSafeInteger(drop.weight) && drop.weight > 0));
    assert.equal(catalog.drops.reduce((sum, drop) => sum + drop.weight, 0), 1000000);
  } else assert.deepEqual(catalog.drops, expectedEdition.drops);
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
  stage = 'ore-catalog';
  const current = await get('/shop/catalog?catalogVersion=3');
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).figures.map(f => f.id), ['fig2', 'bonk', 'jup', 'ore']);
  stage = 'dynamic-figure-catalog';
  const manifestResponse = await get('/shop/figures');
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.schema, 1);
  const dynamicResponse = await get('/shop/catalog?catalogVersion=4');
  assert.equal(dynamicResponse.status, 200);
  const dynamic = await dynamicResponse.json();
  assert.deepEqual(dynamic.figures.map(f => f.id), manifest.figures.filter(f => f.purchasable).map(f => f.id));
  for (const drop of catalog.drops) assert.ok(manifest.figures.some(f => f.id === drop.figureId), 'Published pack model must have resources');
  console.log(JSON.stringify({ healthy: true, authenticationRequired: true,
    engine: catalog.engine ?? 'legacy',
    deliveryPayment: catalog.deliveryPayment ?? 'sponsored',
    packPurchasesBlocked: !catalog.available, priceBaseUnits: catalog.payment.amount, weightsValid: true, legacyCatalogCompatible: true,
    paidTransactionCreated: false }));
} catch (error) {
  console.error(JSON.stringify({ failedStage: stage, errorType: error?.name,
    noTransactionSignedOrSubmitted: true }));
  process.exitCode = 1;
}
