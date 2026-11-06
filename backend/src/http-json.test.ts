import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sendJson, sendShopErrorJson } from './http-json.js';
import { ShopError } from './shop-error.js';

test('rejected pack request sends the error status without crashing the HTTP server', async () => {
  let earlyHeaders = false;
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    try {
      await sendJson(response, 201, request.url?.startsWith('/blocked')
        ? Promise.reject(new ShopError('Packs are not available yet.', 503))
        : Promise.resolve({ healthy: true }));
    } catch (error) {
      earlyHeaders = response.headersSent;
      await sendShopErrorJson(response, error instanceof ShopError ? error.status : 500,
        { error: error instanceof Error ? error.message : 'Failed' }, request.url === '/blocked-digitalocean');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const blocked = await fetch(`${origin}/blocked`);
    assert.equal(blocked.status, 503);
    assert.deepEqual(await blocked.json(), { error: 'Packs are not available yet.' });
    assert.equal(earlyHeaders, false);
    const digitalocean = await fetch(`${origin}/blocked-digitalocean`);
    assert.equal(digitalocean.status, 409);
    assert.equal(digitalocean.headers.get('x-ripsy-error-status'), '503');
    assert.deepEqual(await digitalocean.json(), { error: 'Packs are not available yet.' });
    assert.equal(blocked.headers.get('x-ripsy-error-status'), null);
    const next = await fetch(`${origin}/healthy`);
    assert.equal(next.status, 201);
    assert.deepEqual(await next.json(), { healthy: true });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('App Platform shop error transport preserves recovery and other HTTP statuses', async () => {
  const recovery = { code: 'INSUFFICIENT_PURCHASE_TOKEN', required: '1000000', balance: '0' };
  const payload = { error: 'Your saved purchase needs attention.', recovery };
  for (const original of [400, 401, 403, 409, 413, 500, 503]) {
    let status: number | undefined;
    let body: string | undefined;
    const headers = new Map<string, string>();
    const response = {
      setHeader(key: string, value: string) { headers.set(key, value); },
      writeHead(value: number) { status = value; return { end(value: string) { body = value; } }; },
    } as unknown as ServerResponse;
    await sendShopErrorJson(response, original, payload, true);
    assert.equal(status, original === 503 ? 409 : original);
    assert.deepEqual(JSON.parse(body!), payload);
    assert.equal(headers.get('x-ripsy-error-status'), original === 503 ? '503' : undefined);
  }
});

test('pending data and JSON serialization failure never commit success headers', async () => {
  const calls: number[] = [];
  const response = { writeHead(status: number) { calls.push(status); return { end() {} }; } } as unknown as ServerResponse;
  let resolve!: (value: unknown) => void;
  const pending = sendJson(response, 200, new Promise(r => { resolve = r; }));
  await Promise.resolve();
  assert.deepEqual(calls, []);
  resolve({ value: 1n });
  await assert.rejects(pending, /BigInt/);
  assert.deepEqual(calls, []);
  await sendJson(response, 503, { error: 'Try again' });
  assert.deepEqual(calls, [503]);
});

test('server routes do not await data after committing writeHead', () => {
  const source = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /writeHead\([^;]+\bawait\b/);
  assert.match(source, /sendJson\(response, 200, packs\.catalog\(\)\)/);
  assert.match(source, /sendJson\(response, 201, packs\.create\(/);
});
