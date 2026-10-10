import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopClient, ShopRequestError } from '@rps/game-client/shop';
import { FIGURES } from '@rps/core/shop';
import { readFileSync } from 'node:fs';

test('fighter catalog and mint metadata use the approved display names without changing IDs', () => {
  assert.deepEqual(FIGURES.map(figure => [figure.id, figure.name]), [['fig1', 'RIPSY 001'], ['fig2', 'Seeker fighter'], ['bonk', 'BONK'], ['jup', 'Jup'], ['ore', 'ORE']]);
  for (const figure of FIGURES) {
    const metadata = JSON.parse(readFileSync(new URL(`../public/figures/${figure.id}.json`, import.meta.url), 'utf8'));
    assert.equal(metadata.name, figure.name);
    assert.ok(metadata.attributes.some((attribute: { trait_type: string; value: string }) => attribute.trait_type === 'Figure' && attribute.value === figure.id));
  }
  assert.equal(FIGURES[0]!.purchasable, false);
  assert.equal(FIGURES[1]!.seekerExclusive, true);
});

const catalog = { cluster: 'devnet', treasury: null, collection: null, figures: [] };

test('SOL recovery sends only a payment mode and surfaces only a validated server token shortfall', async () => {
  const recovery = { code: 'INSUFFICIENT_PURCHASE_TOKEN', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', required: '1000000', balance: '0' };
  let body: unknown;
  const client = new ShopClient('https://api.example.test', 'session', async (_url, init) => {
    body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ error: 'Not enough JUP', recovery }), { status: 400 });
  });
  await assert.rejects(() => client.create('jup', recovery.mint, 'persisted-key-12345', 'sol'), (e: unknown) => e instanceof ShopRequestError && e.recovery?.required === '1000000');
  assert.deepEqual(body, { figureId: 'jup', buyer: recovery.mint, idempotencyKey: 'persisted-key-12345', paymentMode: 'sol' });
  const invalid = new ShopClient('https://api.example.test', '', async () => new Response(JSON.stringify({ error: 'Not enough JUP', recovery: { ...recovery, balance: '1000000' } }), { status: 400 }));
  await assert.rejects(() => invalid.createPack(recovery.mint, 'persisted-key-12345', 'sol'), (e: unknown) => e instanceof ShopRequestError && e.recovery === null);
});

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

test('catalog accepts referral URLs and remains compatible with older servers', async () => {
  const referral = 'https://store.solanamobile.com/?ref=ripsy&utm_source=app';
  const response = { ...catalog, solanaMobileStoreUrl: referral };
  const client = new ShopClient('https://api.example.test', '', async () => new Response(JSON.stringify(response)));
  assert.equal((await client.catalog()).solanaMobileStoreUrl, referral);
  const oldServer = new ShopClient('https://api.example.test', '', async () => new Response(JSON.stringify(catalog)));
  assert.deepEqual(await oldServer.catalog(), catalog);
});

test('catalog rejects unsafe browser destinations', async () => {
  for (const value of ['javascript:alert(1)', 'http://store.solanamobile.com/', 'https://user:password@store.solanamobile.com/', 'not-a-url', null]) {
    const client = new ShopClient('https://api.example.test', '', async () => new Response(JSON.stringify({ ...catalog, solanaMobileStoreUrl: value })));
    await assert.rejects(() => client.catalog(), /Invalid shop catalog/);
  }
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

test('updated clients explicitly request the expanded catalog without breaking old servers', async () => {
  let requested = '';
  const client = new ShopClient('https://api.example.test', '', async url => {
    requested = String(url);
    return new Response(JSON.stringify(catalog));
  });
  assert.deepEqual(await client.catalog(), catalog);
  assert.equal(requested, 'https://api.example.test/shop/catalog?catalogVersion=4');
});
