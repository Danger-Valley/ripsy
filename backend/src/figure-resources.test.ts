import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { figureManifest } from './figure-resources.js';
import { FIGURES, FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import { loadShopConfig, shopCatalog } from './shop-config.js';
import { parseFigureManifest } from '@rps/core/figure-manifest';
import { parseFigureInventory, parseShopCatalog, figureAssetVariants, figurePaymentPrice } from '@rps/core/shop';
import { INITIAL_PACK, parsePackCatalog, parsePackOrder } from '@rps/core/packs';
import { parseGameState, Piece, toIdx } from '@rps/core';
import { createGameRecord, joinGame, submitLineup, movePiece, gameView, parseGameRecord } from './game-engine.js';

const manifest = figureManifest('https://www.ripsy.fun');
const future = { ...manifest.figures[2]!, id: 'future-fighter', variant: 42, name: 'Future fighter', imageUrl: 'https://www.ripsy.fun/future.png' };
test('registering a backend-only figure adds its catalog and resources without client bootstrap edits', () => {
  const tokenPayment = { mint: '11111111111111111111111111111111', symbol: 'NEW', decimals: 0, amount: '123' };
  FIGURES.push({ ...future, tokenPayment });
  FIGURE_TOKEN_PAYMENTS[future.id] = tokenPayment;
  try {
    assert.equal(figureManifest('https://www.ripsy.fun').figures.at(-1)!.id, future.id);
    const config = loadShopConfig({ SHOP_SOLANA_CLUSTER: 'mainnet-beta' });
    const product = parseShopCatalog(shopCatalog(config)).figures.find(f => f.id === future.id)!;
    assert.equal(product.variant, 42);
    assert.equal(figurePaymentPrice(product, config.cluster), '123 NEW');
  } finally {
    FIGURES.pop();
    delete FIGURE_TOKEN_PAYMENTS[future.id];
  }
});
test('published animation digests and sizes match actual shipped resources', () => {
  for (const f of manifest.figures) {
    const bytes = readFileSync(new URL(`../../frontend/apps/web/public/figures/${f.id}.riv`, import.meta.url));
    assert.equal(bytes.length, f.animation.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), f.animation.sha256);
  }
});
test('client accepts an unknown server fighter, price, inventory and pack result', () => {
  assert.equal(parseFigureManifest({ ...manifest, figures: [...manifest.figures, future] }).figures.at(-1)!.variant, 42);
  const payment = { mint: '11111111111111111111111111111111', symbol: 'NEW', decimals: 0, amount: '123' };
  const product = { ...future, available: true, priceLamports: '0', tokenPayment: payment };
  assert.equal(parseShopCatalog({ cluster: 'mainnet-beta', collection: null, treasury: null, figures: [product] }).figures[0]!.name, future.name);
  assert.equal(figurePaymentPrice(product, 'mainnet-beta'), '123 NEW');
  const address = '11111111111111111111111111111111';
  const inventory = parseFigureInventory({ wallet: address, slots: [address, ...Array(13).fill(null)], assets: [{ assetId: address, figureId: future.id, variant: 42, name: future.name, imageUrl: future.imageUrl }] });
  assert.equal(figureAssetVariants(inventory.assets)[address], 42);
  const drops = [{ figureId: future.id, weight: 1_000_000 }];
  assert.deepEqual(parsePackCatalog({ ...INITIAL_PACK, drops }).drops, drops);
  const order = parsePackOrder({ id: 'a'.repeat(64), buyer: address, receipt: address, asset: address, edition: address, cluster: 'mainnet-beta', transaction: 'AQ==', version: 7, payment: INITIAL_PACK.payment, drops, status: 'confirmed', signature: null, result: future.id, randomness: 'b'.repeat(64), networkFeeLamports: '5000', lastValidBlockHeight: 123, createdAt: 1 });
  assert.equal(order.result, future.id);
});
test('unknown visual variants survive engine persistence, transport and movement', () => {
  const game = createGameRecord('abcdef12', 'alice'); joinGame(game, 'bob');
  const xs = Array.from({ length: 14 }, (_, i) => i % 7);
  const pieces = [...Array(4).fill(Piece.Rock), ...Array(4).fill(Piece.Paper), ...Array(4).fill(Piece.Scissors), Piece.Flag, Piece.Trap];
  submitLineup(game, 'alice', xs, xs.map((_, i) => 5 + Math.floor(i / 7)), pieces, new Date(), [42, ...Array(13).fill(1)]);
  submitLineup(game, 'bob', xs, xs.map((_, i) => Math.floor(i / 7)), pieces);
  const restored = parseGameRecord(JSON.stringify(game));
  assert.equal(parseGameState(gameView(restored, 'bob')).figureVariants![toIdx(0, 5)], 42);
  movePiece(restored, 'alice', 0, 5, 0, 4);
  assert.equal(parseGameState(gameView(restored, 'alice')).figureVariants![toIdx(0, 4)], 42);
});
test('malformed manifests still fail closed', () => {
  for (const change of [{ variant: 0 }, { variant: 256 }, { variant: 1.5 }, { id: '../escape' }, { imageUrl: 'javascript:alert(1)' }, { animation: { ...future.animation, url: 'http://example.test/f.riv' } }, { animation: { ...future.animation, sha256: 'bad' } }, { animation: { ...future.animation, contract: 2 } }, { animation: { ...future.animation, bytes: 999999999 } }]) {
    assert.throws(() => parseFigureManifest({ ...manifest, figures: [...manifest.figures, { ...future, ...change }] }));
  }
  assert.throws(() => parseFigureManifest({ ...manifest, figures: [...manifest.figures, manifest.figures[0]] }));
  assert.throws(() => parseFigureManifest({ ...manifest, figures: manifest.figures.slice(1) }));
});
test('future packs still reject bad totals, duplicate IDs and invalid result identities', () => {
  for (const drops of [[{ figureId: future.id, weight: 1 }], [{ figureId: future.id, weight: -1 }], [{ figureId: future.id, weight: 500000 }, { figureId: future.id, weight: 500000 }], [{ figureId: '../bad', weight: 1000000 }]]) assert.throws(() => parsePackCatalog({ ...INITIAL_PACK, drops }));
});
