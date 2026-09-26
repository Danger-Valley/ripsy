import assert from 'node:assert/strict';
import test from 'node:test';
import { FigureVariant } from '@rps/core';
import { FigureInventoryService, type FigureAssetSource } from './figure-inventory.js';
import type { ShopRedis } from './shop-service.js';

const wallet = '11111111111111111111111111111111';
const firstAsset = 'Vote111111111111111111111111111111111111111';
const secondAsset = 'SysvarC1ock11111111111111111111111111111111';

class MemoryRedis implements ShopRedis {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); return 'OK';
  }
  async eval() { return 1; }
}

function fixture(assetIds = [firstAsset, secondAsset]) {
  const redis = new MemoryRedis();
  let current = assetIds;
  const wallets = { address: async () => wallet };
  const source: FigureAssetSource = {
    async listOwned() {
      return current.map((assetId, index) => ({ assetId, figureId: 'fig2', name: `Figure 02 #${index + 1}`, imageUrl: 'https://www.ripsy.fun/figures/fig2.png' }));
    },
  };
  return { redis, service: new FigureInventoryService(redis, wallets, source), setAssets: (next: string[]) => { current = next; } };
}

test('one collectible can occupy only one of fourteen slots', async () => {
  const { service } = fixture();
  const slots = Array<string | null>(14).fill(null);
  slots[0] = firstAsset;
  slots[1] = firstAsset;
  await assert.rejects(() => service.save('player', { slots }), /only be used in one/);

  slots[1] = secondAsset;
  const saved = await service.save('player', { slots });
  assert.deepEqual(saved.slots.slice(0, 3), [firstAsset, secondAsset, null]);
});

test('transferred collectibles are removed while free fig1 slots remain', async () => {
  const { service, setAssets } = fixture();
  const slots = Array<string | null>(14).fill(null);
  slots[3] = firstAsset;
  slots[8] = secondAsset;
  await service.save('player', { slots });
  setAssets([secondAsset]);

  const refreshed = await service.get('player');
  assert.equal(refreshed.slots[3], null);
  assert.equal(refreshed.slots[8], secondAsset);
  assert.equal(refreshed.slots.filter(Boolean).length, 1);
});

test('online lineups cannot use more paid figures than the saved NFT loadout', async () => {
  const { service } = fixture([firstAsset]);
  const slots = Array<string | null>(14).fill(null);
  slots[0] = firstAsset;
  await service.save('player', { slots });
  await service.validateLineup('player', [FigureVariant.Fig2, ...Array(13).fill(FigureVariant.Fig1)]);
  await assert.rejects(
    () => service.validateLineup('player', [FigureVariant.Fig2, FigureVariant.Fig2, ...Array(12).fill(FigureVariant.Fig1)]),
    /allows 1 Figure 02 slot/,
  );
});
