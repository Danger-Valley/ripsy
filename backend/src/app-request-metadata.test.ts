import assert from 'node:assert/strict';
import test from 'node:test';
import { readAppRequestMetadata, apiRouteFamily } from './app-request-metadata.js';

const headers = { 'x-ripsy-app-version': '1.0.0', 'x-ripsy-app-build': '63', 'x-ripsy-app-platform': 'android', 'x-ripsy-app-channel': 'seeker' };
test('API exposes typed native marketing version, build and distribution channel without using them as authentication', () => {
  assert.deepEqual(readAppRequestMetadata(headers), { version: '1.0.0', build: 63, platform: 'android', channel: 'seeker' });
  assert.deepEqual(readAppRequestMetadata({ ...headers, 'x-ripsy-app-platform': 'ios', 'x-ripsy-app-channel': 'ios' }), { version: '1.0.0', build: 63, platform: 'ios', channel: 'ios' });
  assert.equal(readAppRequestMetadata({}), null);
  for (const version of ['1.0.0\nsecret', '', '123', 'Bearer private-value', '1'.repeat(100)]) assert.equal(readAppRequestMetadata({ ...headers, 'x-ripsy-app-version': version }), null);
  for (const build of ['', '0', '-1', '01', '1.2', '63abc', '9'.repeat(20)]) assert.equal(readAppRequestMetadata({ ...headers, 'x-ripsy-app-build': build }), null);
  for (const key of Object.keys(headers)) assert.equal(readAppRequestMetadata({ ...headers, [key]: [headers[key as keyof typeof headers]] }), null);
  assert.equal(readAppRequestMetadata({ ...headers, 'x-ripsy-app-platform': 'ios' }), null);
});
test('request diagnostics log a bounded route family, not arbitrary paths or credentials', () => {
  assert.equal(apiRouteFamily('/shop/orders/private-order-id'), 'shop');
  assert.equal(apiRouteFamily('/session'), 'session'); assert.equal(apiRouteFamily('/push/installations'), 'push');
  assert.equal(apiRouteFamily('/mobile/update-policy'), 'updates'); assert.equal(apiRouteFamily('/anything/private'), 'other');
});
