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
      interface: 'MplCoreAsset',
      grouping: [{ group_key: 'collection', group_value: collection }],
      content: { json_uri: 'https://www.ripsy.fun/figures/fig2.json', metadata: { name: 'RIPSY Figure 02' } },
    }] },
  })));
  const source = createFigureAssetSource('https://rpc.example.test', collection, 'https://www.ripsy.fun');
  assert.deepEqual(await source.listOwned(wallet), [{
    assetId: firstAsset, figureId: 'fig2', variant: 2, name: 'Seeker fighter', imageUrl: 'https://www.ripsy.fun/figures/fig2.png',
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
    /allows 1 collectible fighter slot/,
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
  await assert.rejects(() => service.validateLineup('player', variants, misaligned), /free fighter slot/);
});

test('BONK/Jup/ORE ownership enforces per-slot model, saved set and uniqueness', async () => {
  const redis = new MemoryRedis();
  const assets = [
    { assetId: firstAsset, figureId: 'bonk' as const, name: 'BONK', imageUrl: '/figures/bonk.png' },
    { assetId: secondAsset, figureId: 'jup' as const, name: 'Jup', imageUrl: '/figures/jup.png' },
    { assetId: wallet, figureId: 'ore' as const, name: 'ORE', imageUrl: '/figures/ore.png' },
  ];
  const service = new FigureInventoryService(redis, { address: async () => wallet }, { listOwned: async () => assets });
  const slots = [firstAsset, secondAsset, wallet, ...Array(11).fill(null)];
  await service.save('player', { slots });
  const variants = [3, 4, 5, ...Array(11).fill(1)];
  await service.validateLineup('player', variants, slots);
  await service.validateLineup('player', variants);
  await assert.rejects(() => service.validateLineup('player', [4, 3, 5, ...Array(11).fill(1)], slots), /does not match/);
  await assert.rejects(() => service.validateLineup('player', [2, 2, 5, ...Array(11).fill(1)]), /does not match/);
  await assert.rejects(() => service.validateLineup('player', variants, [firstAsset, firstAsset, wallet, ...Array(11).fill(null)]), /only be used/);
  await assert.rejects(() => service.validateLineup('player', [3, 4, 4, ...Array(11).fill(1)], slots), /does not match/);
});

test('inventory recognizes new official Core models but rejects foreign, burnt and mismatched assets', async t => {
  const collection = 'official';
  const core = (id: string, figureId: string) => ({ id, interface: 'MplCoreAsset', grouping: [{ group_key: 'collection', group_value: collection }], content: { json_uri: `https://www.ripsy.fun/figures/${figureId}.json`, metadata: { attributes: [{ trait_type: 'Figure', value: figureId }] } } });
  const mismatched = core(wallet, 'bonk');
  mismatched.content.json_uri = 'https://www.ripsy.fun/figures/jup.json';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ result: { items: [
    core(firstAsset, 'bonk'), core(secondAsset, 'jup'), core(wallet, 'ore'),
    { ...core(wallet, 'bonk'), interface: 'V1_NFT' },
    { ...core(wallet, 'jup'), burnt: true },
    { ...core(wallet, 'bonk'), grouping: [{ group_key: 'collection', group_value: 'foreign' }] },
    mismatched,
  ] } })));
  const assets = await createFigureAssetSource('https://rpc.example.test', collection, 'https://www.ripsy.fun').listOwned(wallet);
  assert.deepEqual(assets.map(asset => [asset.figureId, asset.name]).sort(), [['bonk', 'BONK'], ['jup', 'Jup'], ['ore', 'ORE']]);
});
