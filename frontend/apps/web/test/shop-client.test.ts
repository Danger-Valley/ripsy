import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopClient } from '@rps/game-client/shop';

const catalog = { cluster: 'devnet', treasury: null, collection: null, figures: [] };

test('default browser fetch keeps its global receiver, not a ShopClient receiver', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async function (this: unknown) {
      assert.equal(this, globalThis);
      return new Response(JSON.stringify(catalog));
    };
    assert.deepEqual(await new ShopClient('https://api.example.test', '').catalog(), catalog);
  } finally { globalThis.fetch = original; }
});

test('shop requests use bearer session, exact order ID, and no client supplied price', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = new ShopClient('https://api.example.test/', 'session-token', async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return new Response(JSON.stringify({ error: 'Test failure before payment' }), { status: 409 });
  });
  await assert.rejects(() => client.create('fig1', 'buyer-address', 'persisted-key-12345'), /Test failure before payment/);
  assert.equal(requests[0]!.url, 'https://api.example.test/shop/orders');
  assert.equal(new Headers(requests[0]!.init.headers).get('authorization'), 'Bearer session-token');
  assert.deepEqual(JSON.parse(String(requests[0]!.init.body)), { figureId: 'fig1', buyer: 'buyer-address', idempotencyKey: 'persisted-key-12345' });
});

test('malformed success payload cannot become a purchase', async () => {
  const client = new ShopClient('https://api.example.test', '', async () => new Response('{}'));
  await assert.rejects(() => client.get('a'.repeat(64)), /Invalid mint order/);
});

test('wallet disconnect clears the authenticated server binding', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = new ShopClient('https://api.example.test', 'session-token', async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return new Response(null, { status: 204 });
  });
  await client.clearWallet();
  assert.equal(requests[0]!.url, 'https://api.example.test/shop/wallet');
  assert.equal(requests[0]!.init.method, 'DELETE');
  assert.equal(new Headers(requests[0]!.init.headers).get('authorization'), 'Bearer session-token');
});
