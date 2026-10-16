/** Message-only admin check. --initialize explicitly persists the unchanged default settings once. Never signs transactions. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignInMessage } from '@solana/wallet-standard-util';

const path = process.argv.find(value => value.startsWith('--admin='))?.slice(8);
if (!path) throw new Error('Pass --admin=/absolute/keypair.json for message-only sign-in.');
const api = 'https://api.ripsy.fun', admin = 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh';
const umi = createUmi('https://api.mainnet-beta.solana.com'); // Only local signing; no RPC calls.
const keypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
assert.equal(keypair.publicKey, admin);
const call = async (path: string, token?: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${api}${path}`, { method, signal: AbortSignal.timeout(15000),
    headers: { origin: 'https://www.ripsy.fun', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, `Admin readiness request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
};
const session = await call('/session', undefined, 'POST');
const challenge = await call('/shop/admin/challenge', session.token, 'POST');
assert.equal(challenge.domain, 'www.ripsy.fun'); assert.equal(challenge.uri, 'https://www.ripsy.fun');
assert.equal(challenge.statement, 'Sign in to RIPSY shop administration. This message does not publish settings or send a transaction.');
const message = createSignInMessage({ ...challenge, address: admin });
const auth = await call('/shop/admin/verify', session.token, 'POST', { nonce: challenge.nonce, address: admin,
  signedMessage: [...message], signature: [...await umi.eddsa.sign(message, keypair)] });
try {
  let settings = await call('/shop/admin/settings', auth.token);
  assert.equal(settings.backendPack.catalog.engine, 'backend');
  assert.equal(settings.backendPack.catalog.payment.amount, '10000000');
  assert.deepEqual(settings.backendPack.catalog.drops, [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }]);
  let initialized = false;
  if (process.argv.includes('--initialize')) {
    assert.equal(settings.backendPack.catalog.version, 1, 'Only initialize an untouched default settings record');
    assert.equal(settings.backendPack.audit.length, 0);
    const before = settings.backendPack.catalog;
    await call('/shop/admin/pack-settings', auth.token, 'PUT', { expectedVersion: 1, price: '10', available: before.available, drops: before.drops });
    settings = await call('/shop/admin/settings', auth.token);
    assert.deepEqual({ ...settings.backendPack.catalog, version: 1 }, before);
    assert.equal(settings.backendPack.catalog.version, 2);
    assert.equal(settings.backendPack.audit.length, 1);
    initialized = true;
  }
  const retired = await fetch(`${api}/shop/admin/publications/${'0'.repeat(64)}`, {
    headers: { authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(15000) });
  assert.equal(retired.status, 409, 'Retired administrative jobs must not poll or rebroadcast onchain');
  console.log(JSON.stringify({ authenticatedAdminRead: true, backendSettings: true, price: '10 SKR', drops: settings.backendPack.catalog.drops,
    revision: settings.backendPack.catalog.version, available: settings.pack.available, retiredJobsBlocked: true, valuesUnchanged: true, initialized, transactionSigned: false }));
} finally { await call('/shop/admin/session', auth.token, 'DELETE'); }
