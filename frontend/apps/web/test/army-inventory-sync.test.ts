import assert from 'node:assert/strict';
import test from 'node:test';
import { FIGURE_INVENTORY_REFRESH_MS, retainOwnedFigureSlots } from '../app/army/inventory-sync';

test('background ownership sync removes transferred Core assets without replacing valid draft slots', () => {
  const kept = 'Vote111111111111111111111111111111111111111';
  const transferred = 'SysvarC1ock11111111111111111111111111111111';
  const slots = [kept, transferred, null, ...Array<string | null>(11).fill(null)];
  const assets = [{ assetId: kept, figureId: 'jup' as const, variant: 4, name: 'Jup', imageUrl: '/figures/jup.png' }];
  assert.deepEqual(retainOwnedFigureSlots(slots, assets), [kept, null, null, ...Array<string | null>(11).fill(null)]);
  assert.equal(FIGURE_INVENTORY_REFRESH_MS, 120_000);
});
