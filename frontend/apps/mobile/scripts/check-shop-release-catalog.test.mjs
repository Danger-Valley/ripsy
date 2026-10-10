import assert from 'node:assert/strict';
import test from 'node:test';
import { readyShopCatalog } from './check-shop-release-catalog.mjs';
const catalog = () => ({ cluster: 'mainnet-beta', collection: 'Be5v35XMGKi4SvBa5hzLsNxArfv9i76p637qjKpDt9bk',
  treasury: 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh', figures: [{ id: 'fig2', available: true,
    seekerExclusive: true, priceLamports: '0', imageUrl: 'https://www.ripsy.fun/figures/fig2.png',
    tokenPayment: { mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', symbol: 'SKR', decimals: 6, amount: '1000000' } }] });
test('release accepts current SKR payment and future admin prices without assuming SOL', () => {
  assert.equal(readyShopCatalog(catalog()), true);
  const c = catalog(); c.figures[0].tokenPayment.amount = '25000000'; assert.equal(readyShopCatalog(c), true);
});
test('rejects legacy SOL, wrong mint/precision, zero or invalid token amounts', () => {
  for (const patch of [{ mint: '11111111111111111111111111111111' }, { symbol: 'SOL' }, { decimals: 9 },
    { amount: '0' }, { amount: '1.2' }, { amount: '1,000' }, { amount: null }]) {
    const c = catalog(); Object.assign(c.figures[0].tokenPayment, patch); assert.equal(readyShopCatalog(c), false);
  }
  const c = catalog(); delete c.figures[0].tokenPayment; c.figures[0].priceLamports = '10000000'; assert.equal(readyShopCatalog(c), false);
});
test('retains enabled mainnet, exclusive figure, collection/treasury and HTTPS checks', () => {
  for (const patch of [{ cluster: 'devnet' }, { collection: null }, { treasury: '' }, { figures: [] }, { figures: undefined }])
    assert.equal(readyShopCatalog({ ...catalog(), ...patch }), false);
  for (const patch of [{ available: false }, { seekerExclusive: false }, { imageUrl: 'http://example.com/a.png' }, { priceLamports: '1' }]) {
    const c = catalog(); Object.assign(c.figures[0], patch); assert.equal(readyShopCatalog(c), false);
  }
  const c = catalog(); c.figures.push({ id: 'fig1' }); assert.equal(readyShopCatalog(c), false);
  assert.equal(readyShopCatalog(null), false); assert.equal(readyShopCatalog({}), false);
});
