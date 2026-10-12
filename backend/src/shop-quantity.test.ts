import assert from 'node:assert/strict';
import test from 'node:test';
import { figureQuantityPrice, figureQuantityLimit, figureOrderQuantity, figureOrderAssets, parseMintOrder, parseShopCatalog, FIGURE_TOKEN_PAYMENTS, figurePaymentPrice } from '@rps/core/shop';

const asset = '11111111111111111111111111111111';
const second = 'So11111111111111111111111111111111111111112';
const order = { id: 'a'.repeat(64), buyer: asset, asset, figureId: 'jup', collection: 'SysvarRent111111111111111111111111111111111', treasury: second,
  cluster: 'mainnet-beta', priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.jup, transaction: 'AQ==', lastValidBlockHeight: 100, networkFeeLamports: '1000', createdAt: 1, status: 'prepared', signature: null, error: null };
test('quantity totals use exact token precision and do not mutate unit quotes', () => {
  for (const id of ['fig2', 'bonk', 'jup', 'ore']) {
    const tokenPayment = FIGURE_TOKEN_PAYMENTS[id]!;
    const copy = JSON.stringify(tokenPayment); const total = figureQuantityPrice({ priceLamports: '0', tokenPayment }, 3);
    assert.equal(total.tokenPayment!.amount, (BigInt(tokenPayment.amount) * 3n).toString()); assert.equal(JSON.stringify(tokenPayment), copy);
  }
  assert.equal(figurePaymentPrice(figureQuantityPrice({ priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.ore }, 3), 'mainnet-beta'), '0.75 ORE');
  assert.equal(figureQuantityPrice({ priceLamports: '123456789' }, 3).priceLamports, '370370367');
  assert.equal(figureQuantityLimit({ priceLamports: Number.MAX_SAFE_INTEGER.toString() }, 3), 1);
  assert.throws(() => figureQuantityPrice({ priceLamports: '0', tokenPayment: { ...FIGURE_TOKEN_PAYMENTS.jup!, amount: '18446744073709551615' } }, 2), /too large/);
});
test('legacy receipts remain single figures; new receipts require exact, unique asset counts', () => {
  const legacy = parseMintOrder(order); assert.equal(figureOrderQuantity(legacy), 1); assert.deepEqual(figureOrderAssets(legacy), [asset]);
  const multiple = parseMintOrder({ ...order, quantity: 2, assets: [asset, second] }); assert.equal(figureOrderQuantity(multiple), 2); assert.deepEqual(figureOrderAssets(multiple), [asset, second]);
  for (const value of [{ quantity: 2 }, { quantity: 2, assets: [asset] }, { quantity: 2, assets: [asset, asset] }, { quantity: 2, assets: [second, asset] }, { quantity: '2' }, { quantity: null }, { quantity: 4, assets: [asset, second] }, { assets: [asset, second] }]) assert.throws(() => parseMintOrder({ ...order, ...value }), /mint order/);
  const catalog = { cluster: 'mainnet-beta', treasury: null, collection: null, figures: [] };
  assert.equal(parseShopCatalog(catalog).maxFigureQuantity, undefined);
  assert.equal(parseShopCatalog({ ...catalog, maxFigureQuantity: 3 }).maxFigureQuantity, 3);
  for (const maxFigureQuantity of [0, 4, '3', null]) assert.throws(() => parseShopCatalog({ ...catalog, maxFigureQuantity }), /catalog/);
});
