import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { INITIAL_PACK } from '@rps/core/packs';

// Node renders the real card; only Next's build-time CSS module is stubbed.
const require = createRequire(import.meta.url);
const originalCssLoader = require.extensions['.css'];
require.extensions['.css'] = module => { module.exports = {}; };
const { PackCard } = require('../app/shop/pack-card') as typeof import('../app/shop/pack-card');
if (originalCssLoader) require.extensions['.css'] = originalCssLoader;
else delete require.extensions['.css'];

type Pack = React.ComponentProps<typeof PackCard>['pack'];
const buyer = '11111111111111111111111111111111';
const saved = {
  id: 'a'.repeat(64), buyer, asset: buyer, receipt: buyer, edition: buyer,
  cluster: 'mainnet-beta', version: 1, payment: INITIAL_PACK.payment,
  drops: INITIAL_PACK.drops, status: 'waiting-result', result: null,
};
function render(changes: object = {}) {
  const pack = { catalog: { ...INITIAL_PACK, available: true }, hasPurchase: false,
    ready: true, busy: false, order: null, error: null, signingStarted: true, ...changes } as Pack;
  return renderToStaticMarkup(React.createElement(PackCard, {
    pack, address: buyer, blocked: false, onBuy() { assert.fail('Render must not purchase'); },
    onConfirm() { assert.fail('Render must not sign'); },
  }));
}

test('web hides the whole pack product while paused, loading or unavailable, without a placeholder', () => {
  for (const catalog of [null, { ...INITIAL_PACK, available: false }]) {
    assert.equal(render({ catalog }), '');
    assert.equal(render({ catalog, error: 'Catalog unavailable' }), '');
  }
  assert.match(render(), /Fighter pack/);
  assert.match(render(), /Buy pack/);
  assert.match(render(), /50% chance/);
});

test('web retains paid pack recovery and the confirmed reward while new sales are hidden', () => {
  for (const catalog of [null, { ...INITIAL_PACK, available: false }]) {
    const pending = render({ catalog, hasPurchase: true, order: saved });
    assert.match(pending, /Opening your pack/);
    assert.match(pending, /Check pack status/);
    assert.doesNotMatch(pending, /Buy pack|Packs coming soon|Check pack availability|% chance/);
    const complete = render({ catalog, hasPurchase: true, order: { ...saved, status: 'confirmed', result: 'bonk' } });
    assert.match(complete, /Your new fighter!/);
    assert.match(complete, /Add to your army/);
    assert.doesNotMatch(complete, /Buy pack|% chance/);
  }
});
