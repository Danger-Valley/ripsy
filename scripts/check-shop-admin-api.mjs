// Read-only production readiness, apart from one anonymous diagnostic session.
// Never signs, creates a publication/purchase, saves prices or imports a key.
import assert from 'node:assert/strict';
const api = 'https://api.ripsy.fun';
const address = 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh';
const get = (path, options = {}) => fetch(`${api}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
let stage = 'health';
try {
  const health = await get('/health'); assert.equal(health.status, 200); assert.equal((await health.json()).redis, 'connected');
  stage = 'admin-config'; const c = await get('/shop/admin/config'); assert.equal(c.status, 200); assert.deepEqual(await c.json(), { enabled: true, address });
  assert.equal(c.headers.get('cache-control'), 'no-store');
  stage = 'protected-settings'; assert.equal((await get('/shop/admin/settings')).status, 401);
  stage = 'anonymous-session'; const s = await get('/session', { method: 'POST' }); assert.equal(s.status, 201); const session = await s.json();
  const headers = { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', origin: 'https://www.ripsy.fun' };
  stage = 'customer-is-not-admin'; assert.equal((await get('/shop/admin/settings', { headers })).status, 401);
  // Invalid empty bodies cannot mutate anything, even if an auth regression exists.
  for (const [path, method] of [['/shop/admin/prices', 'PUT'], ['/shop/admin/publications', 'POST'], ['/shop/admin/pack-price', 'POST']]) assert.equal((await get(path, { method, headers, body: '{}' })).status, 401);
  stage = 'cors'; assert.equal((await get('/shop/admin/config', { headers: { origin: 'https://not-ripsy.invalid' } })).status, 403);
  stage = 'catalog'; const catalog = await (await get('/shop/catalog?catalogVersion=4')).json();
  assert.deepEqual(catalog.figures.map(f => f.id), ['fig2', 'bonk', 'jup', 'ore']);
  const pack = await (await get('/shop/packs/catalog', { headers })).json();
  stage = 'web-admin'; const page = await fetch('https://www.ripsy.fun/admin/shop', { signal: AbortSignal.timeout(15000) });
  assert.equal(page.status, 200); assert.ok((await page.text()).includes('Shop control room'));
  console.log(JSON.stringify({ ready: true, wallet: address, customerTokensRejected: true, corsRestricted: true, prices: catalog.figures.map(f => ({ id: f.id, amount: f.tokenPayment?.amount ?? f.priceLamports })), packVersion: pack.version, packAmount: pack.payment.amount, packDrops: pack.drops, transactionSent: false }));
} catch (error) {
  console.error(JSON.stringify({ ready: false, failedStage: stage, errorType: error.name, transactionSent: false })); process.exitCode = 1;
}
