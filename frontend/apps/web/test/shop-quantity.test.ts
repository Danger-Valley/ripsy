import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantityPicker } from '../app/shop/quantity-picker';
import { ShopClient } from '@rps/game-client/shop';
import { FIGURE_TOKEN_PAYMENTS } from '@rps/core/shop';

const buyer = '11111111111111111111111111111111';
const assets = ['So11111111111111111111111111111111111111112', 'SysvarRent111111111111111111111111111111111'];
const order = { id: 'a'.repeat(64), figureId: 'jup', buyer, asset: assets[0], assets, quantity: 2, treasury: buyer, collection: buyer,
  cluster: 'mainnet-beta', priceLamports: '0', tokenPayment: { ...FIGURE_TOKEN_PAYMENTS.jup, amount: '198000000' }, networkFeeLamports: '1000', transaction: 'AQ==', lastValidBlockHeight: 100, createdAt: 1, status: 'prepared', signature: null, error: null };
test('quantity API sends the count, never a client price, and rejects an old server returning only one figure', async () => {
  let body: Record<string, unknown>;
  const client = new ShopClient('https://api.example.test', 'session', async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify(order)); });
  assert.equal((await client.create('jup', buyer, 'bulk-purchase-12345', undefined, 2)).quantity, 2);
  assert.deepEqual(body!, { figureId: 'jup', buyer, idempotencyKey: 'bulk-purchase-12345', quantity: 2 });
  const old = new ShopClient('https://api.example.test', '', async () => { const { assets: _a, quantity: _q, ...single } = order; return new Response(JSON.stringify(single)); });
  await assert.rejects(old.create('jup', buyer, 'bulk-purchase-12345', 'sol', 2), /selected number/);
});
test('web quantity uses labelled real buttons, a live count and disabled boundaries without automatic purchasing', () => {
  const changes: number[] = [];
  const props = { name: 'Jup', value: 2, maximum: 3, disabled: false, onChange: (value: number) => changes.push(value) };
  const html = renderToStaticMarkup(React.createElement(QuantityPicker, props));
  assert.match(html, /role="group" aria-label="Jup quantity"/); assert.match(html, /type="button" aria-label="More Jup figures"/); assert.match(html, /aria-live="polite"/);
  const element = QuantityPicker(props); const children = element.props.children as React.ReactElement<{ onClick?: () => void }>[];
  children[1]!.props.onClick!(); children[3]!.props.onClick!(); assert.deepEqual(changes, [1, 3]);
  assert.match(renderToStaticMarkup(React.createElement(QuantityPicker, { ...props, value: 1 })), /aria-label="Fewer Jup figures" disabled=""/);
  assert.match(renderToStaticMarkup(React.createElement(QuantityPicker, { ...props, value: 3 })), /aria-label="More Jup figures" disabled=""/);
});
