import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleShopReconciliation } from './shop-reconciliation-http.js';

test('reconcile HTTP requires a valid current session and forwards only to the read-only service', async () => {
  const calls: unknown[] = []; const id = 'a'.repeat(64);
  const request = { method: 'POST', headers: { authorization: 'Bearer new-session' } } as IncomingMessage;
  const response = { writeHead(status: number) { calls.push(status); return this; }, end(body: string) { calls.push(JSON.parse(body)); } } as unknown as ServerResponse;
  const body = { transaction: 'original-partially-signed-receipt', signed: 'original-signed-bytes' };
  const dependencies = {
    verifyPlayer(authorization: string | undefined) { if (authorization !== 'Bearer new-session') throw new Error('Authentication required'); return 'new-player'; },
    async readBody() { calls.push('read'); return body; },
    service: { async reconcile(player: string, order: string, input: object) { calls.push([player, order, input]); return { status: 'confirmed' } as never; } },
  };
  assert.equal(await handleShopReconciliation(request, response, `/shop/orders/${id}/reconcile`, dependencies), true);
  assert.deepEqual(calls, ['read', ['new-player', id, body], 200, { status: 'confirmed' }]);
  calls.length = 0; request.headers.authorization = undefined;
  await assert.rejects(handleShopReconciliation(request, response, `/shop/orders/${id}/reconcile`, dependencies), /Authentication/);
  assert.deepEqual(calls, []);
  for (const [method, pathname] of [['GET', `/shop/orders/${id}/reconcile`], ['POST', `/shop/orders/${id}/submit`], ['POST', '/shop/orders/invalid/reconcile']]) {
    request.method = method;
    assert.equal(await handleShopReconciliation(request, response, pathname!, dependencies), false);
    assert.deepEqual(calls, []);
  }
});
