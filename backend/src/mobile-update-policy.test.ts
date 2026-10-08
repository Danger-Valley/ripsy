import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { disabledUpdatePolicy, parseUpdatePolicy, requiredUpdate, validUpdateUrl } from '@rps/core/app-updates';
import { loadMobileUpdatePolicy, sendMobileUpdatePolicy } from './mobile-update-policy.js';

test('mobile updates default to disabled for every channel and do not borrow shop flags', () => {
  const policy = loadMobileUpdatePolicy({ PACK_ENABLED: 'true' });
  for (const channel of ['ios', 'android', 'seeker'] as const) {
    assert.equal(requiredUpdate(policy, channel, 1), null);
    assert.equal(policy[channel].storeUrl, null);
  }
  assert.deepEqual(loadMobileUpdatePolicy({ MOBILE_UPDATE_POLICY: ' ' }), policy);
});

test('threshold is an inclusive minimum native build, scoped independently to each channel', () => {
  const policy = disabledUpdatePolicy();
  policy.ios = { ...policy.ios, minimumBuild: 57, storeUrl: 'https://testflight.apple.com/join/VU1k1zfy', latestVersion: '1.0.0' };
  const loaded = loadMobileUpdatePolicy({ MOBILE_UPDATE_POLICY: JSON.stringify(policy) });
  assert.equal(requiredUpdate(loaded, 'ios', 56)?.minimumBuild, 57);
  assert.equal(requiredUpdate(loaded, 'ios', 57), null);
  assert.equal(requiredUpdate(loaded, 'ios', 58), null);
  assert.equal(requiredUpdate(loaded, 'android', 1), null);
  assert.equal(requiredUpdate(loaded, 'seeker', 1), null);
});

test('invalid configured policies fail without leaking configuration values', () => {
  for (const bad of [null, [], {}, { schema: 2 }, { ...disabledUpdatePolicy(), ios: null }]) {
    assert.throws(() => parseUpdatePolicy(bad));
  }
  for (const minimumBuild of [-1, 0.5, '57', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseUpdatePolicy({ ...disabledUpdatePolicy(), ios: { minimumBuild, storeUrl: 'https://example.com' } }));
  }
  assert.throws(() => parseUpdatePolicy({ ...disabledUpdatePolicy(), ios: { minimumBuild: 57 } }), /URL/);
  assert.throws(() => loadMobileUpdatePolicy({ MOBILE_UPDATE_POLICY: 'private-invalid-value' }), error =>
    error instanceof Error && error.message.includes('MOBILE_UPDATE_POLICY') && !error.message.includes('private-invalid-value'));
  for (const field of ['title', 'message', 'latestVersion']) {
    assert.throws(() => parseUpdatePolicy({ ...disabledUpdatePolicy(), ios: { minimumBuild: 0, [field]: 'a'.repeat(401) } }));
  }
});

test('store links reject executable/credentialed/incorrect package destinations and unsafe fallbacks', () => {
  const dapp = 'solanadappstore://details?id=com.dangervalley.ripsy';
  assert.equal(validUpdateUrl(dapp, 'seeker'), true);
  assert.equal(validUpdateUrl(dapp, 'android'), false);
  assert.equal(validUpdateUrl(dapp, 'seeker', true), false);
  for (const url of ['javascript:alert(1)', 'intent://details', 'file:///tmp/app.apk', 'http://example.com',
    'https://user:password@example.com', 'https://user@example.com', 'https://example.com:99999',
    'https://example.com/ bad', 'https://example.com\\bad',
    'solanadappstore://details?id=another.app']) {
    assert.equal(validUpdateUrl(url, 'seeker'), false, url);
  }
  const policy = disabledUpdatePolicy();
  policy.seeker = { ...policy.seeker, minimumBuild: 57, storeUrl: dapp, fallbackUrl: 'https://www.ripsy.fun/download' };
  assert.deepEqual(parseUpdatePolicy(policy), policy);
});

test('update policy is public, uncached and method-limited HTTP JSON, including safe OPTIONS', async () => {
  const policy = disabledUpdatePolicy();
  const server = createServer((request, response) => sendMobileUpdatePolicy(request, response, policy));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/mobile/update-policy`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), policy);
    assert.equal((await fetch(url, { method: 'OPTIONS' })).status, 204);
    const post = await fetch(url, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, OPTIONS');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  const source = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf("requestUrl.pathname === '/mobile/update-policy'") < source.indexOf("requestUrl.pathname.startsWith('/shop/')"));
});
