import assert from 'node:assert/strict';
import test from 'node:test';
import { FigureVariant } from '@rps/core';
import { createFigureAssetSource, FigureInventoryService, type FigureAssetSource } from './figure-inventory.js';
import type { ShopRedis } from './shop-service.js';

const wallet = '11111111111111111111111111111111';
const firstAsset = 'Vote111111111111111111111111111111111111111';
const secondAsset = 'SysvarC1ock11111111111111111111111111111111';

test('existing Core collectibles use the renamed fighter label without changing their asset IDs', async t => {
  const collection = 'ripsy-collection';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    result: { items: [{
      id: firstAsset,
      grouping: [{ group_key: 'collection', group_value: collection }],
      content: { json_uri: 'https://www.ripsy.fun/figures/fig2.json', metadata: { name: 'RIPSY Figure 02' } },
    }] },
  })));
  const source = createFigureAssetSource('https://rpc.example.test', collection, 'https://www.ripsy.fun');
  assert.deepEqual(await source.listOwned(wallet), [{
    assetId: firstAsset, figureId: 'fig2', name: 'Seeker fighter', imageUrl: 'https://www.ripsy.fun/figures/fig2.png',
  }]);
});

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
      return current.map((assetId, index) => ({ assetId, figureId: 'fig2', name: `Seeker fighter #${index + 1}`, imageUrl: 'https://www.ripsy.fun/figures/fig2.png' }));
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
    /allows 1 Seeker fighter slot/,
  );
});

test('online lineups bind each paid slot to the exact equipped Core collectible', async () => {
  const { service } = fixture();
  const slots = Array<string | null>(14).fill(null);
  slots[2] = firstAsset;
  slots[9] = secondAsset;
  await service.save('player', { slots });

  const variants = Array(14).fill(FigureVariant.Fig1);
  variants[1] = FigureVariant.Fig2;
  variants[11] = FigureVariant.Fig2;
  const shuffledAssets = Array<string | null>(14).fill(null);
  shuffledAssets[1] = secondAsset;
  shuffledAssets[11] = firstAsset;
  await service.validateLineup('player', variants, shuffledAssets);

  const duplicate = [...shuffledAssets];
  duplicate[11] = secondAsset;
  await assert.rejects(() => service.validateLineup('player', variants, duplicate), /only be used in one lineup slot/);

  const foreign = [...shuffledAssets];
  foreign[11] = 'Stake11111111111111111111111111111111111111';
  await assert.rejects(() => service.validateLineup('player', variants, foreign), /does not match/);

  const misaligned = [...shuffledAssets];
  misaligned[0] = firstAsset;
  misaligned[11] = null;
  await assert.rejects(() => service.validateLineup('player', variants, misaligned), /only be assigned to a Seeker fighter slot/);
});
