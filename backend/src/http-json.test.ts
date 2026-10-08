import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sendJson } from './http-json.js';
import { ShopError } from './shop-error.js';

test('rejected pack request sends the error status without crashing the HTTP server', async () => {
  let earlyHeaders = false;
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    try {
      await sendJson(response, 201, request.url === '/blocked'
        ? Promise.reject(new ShopError('Packs are not available yet.', 503))
        : Promise.resolve({ healthy: true }));
    } catch (error) {
      earlyHeaders = response.headersSent;
      await sendJson(response, error instanceof ShopError ? error.status : 500,
        { error: error instanceof Error ? error.message : 'Failed' });
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
    const next = await fetch(`${origin}/healthy`);
    assert.equal(next.status, 201);
    assert.deepEqual(await next.json(), { healthy: true });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
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
