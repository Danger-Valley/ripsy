import { FigureVariant } from '@rps/core';
import { FIGURE_SLOTS, type FigureInventory, type OwnedFigureAsset } from '@rps/core/shop';
import { FIGURES, figureVariantForId } from './figure-registry.js';
import { ShopError } from './shop-error.js';
import type { ShopRedis } from './shop-service.js';

export interface FigureAssetSource {
  listOwned(address: string): Promise<OwnedFigureAsset[]>;
}

export interface WalletAddressResolver {
  address(playerId: string): Promise<string | null>;
}

export class FigureInventoryService {
  constructor(
    private redis: ShopRedis,
    private wallets: WalletAddressResolver,
    private source: FigureAssetSource,
    private prefix = 'ripsy',
  ) {}

  async get(playerId: string): Promise<FigureInventory> {
    const wallet = await this.wallets.address(playerId);
    if (!wallet) throw new ShopError('Verify a Solana wallet to manage your army.', 403);
    const assets = await this.source.listOwned(wallet);
    const owned = new Set(assets.map(asset => asset.assetId));
    const stored = await this.readSlots(wallet);
    const seen = new Set<string>();
    const slots = stored.map(assetId => {
      if (!assetId || !owned.has(assetId) || seen.has(assetId)) return null;
      seen.add(assetId);
      return assetId;
    });
    if (slots.some((value, index) => value !== stored[index])) await this.writeSlots(wallet, slots);
    return { wallet, assets, slots };
  }

  async save(playerId: string, input: Record<string, unknown>): Promise<FigureInventory> {
    if (!Array.isArray(input.slots) || input.slots.length !== FIGURE_SLOTS
      || !input.slots.every(value => value === null || typeof value === 'string')) {
      throw new ShopError(`An army must contain exactly ${FIGURE_SLOTS} figure slots.`);
    }
    const inventory = await this.get(playerId);
    const owned = new Set(inventory.assets.map(asset => asset.assetId));
    const seen = new Set<string>();
    const slots = input.slots.map(value => {
      if (value === null) return null;
      if (!owned.has(value)) throw new ShopError('This collectible is not in your verified wallet.', 403);
      if (seen.has(value)) throw new ShopError('One collectible can only be used in one army slot.', 409);
      seen.add(value);
      return value;
    });
    await this.writeSlots(inventory.wallet, slots);
    return { ...inventory, slots };
  }

  async validateLineup(
    playerId: string,
    variants: number[] | undefined,
    assetIds?: Array<string | null>,
  ): Promise<void> {
    const requested = variants ?? Array(FIGURE_SLOTS).fill(FigureVariant.Fig1);
    if (requested.length !== FIGURE_SLOTS || requested.some(variant => !FIGURES.some(figure => figure.variant === variant))) throw new ShopError('Invalid figure variants');
    const collectibleCount = requested.filter(variant => variant !== FigureVariant.Fig1).length;
    if (assetIds && (assetIds.length !== FIGURE_SLOTS || requested.length !== FIGURE_SLOTS)) {
      throw new ShopError(`A lineup must identify exactly ${FIGURE_SLOTS} figure slots.`);
    }
    if (assetIds) {
      requested.forEach((variant, index) => {
        const assetId = assetIds[index];
        if (variant !== FigureVariant.Fig1 && !assetId) {
          throw new ShopError('Every collectible fighter slot must identify its Core collectible.', 403);
        }
        if (variant === FigureVariant.Fig1 && assetId) {
          throw new ShopError('A Core collectible cannot be assigned to a free fighter slot.', 403);
        }
      });
      const selected = assetIds.filter((assetId): assetId is string => Boolean(assetId));
      if (new Set(selected).size !== selected.length) {
        throw new ShopError('One collectible can only be used in one lineup slot.', 409);
      }
    }
    if (collectibleCount === 0) return;
    const inventory = await this.get(playerId);
    const equipped = inventory.slots.filter((assetId): assetId is string => Boolean(assetId));
    const equippedCount = equipped.length;
    if (collectibleCount !== equippedCount) {
      throw new ShopError(`Your saved army allows ${equippedCount} collectible fighter slot${equippedCount === 1 ? '' : 's'}.`, 403);
    }
    // Legacy clients only sent visual variants. New clients prove the exact Core assets
    // used by the shuffled lineup, without publishing those wallet identifiers in GameState.
    if (!assetIds) {
      // Old clients only support fig2. Check per-model counts, not total ownership.
      for (const figure of FIGURES.filter(candidate => candidate.purchasable)) {
        const count = equipped.filter(id => inventory.assets.some(asset => asset.assetId === id && asset.figureId === figure.id)).length;
        if (requested.filter(variant => variant === figure.variant).length !== count) throw new ShopError('Your lineup does not match your saved figures.', 403);
      }
      return;
    }
    requested.forEach((variant, index) => {
      const asset = inventory.assets.find(candidate => candidate.assetId === assetIds[index]);
      if (variant !== FigureVariant.Fig1 && (!asset || figureVariantForId(asset.figureId) !== variant)) throw new ShopError('The collectible does not match this fighter.', 403);
    });
    const selected = assetIds.filter((assetId): assetId is string => Boolean(assetId));
    const equippedSet = new Set(equipped);
    if (selected.some(assetId => !equippedSet.has(assetId)) || equipped.some(assetId => !selected.includes(assetId))) {
      throw new ShopError('Your lineup does not match the Core collectibles saved in your Army.', 403);
    }
  }

  private async readSlots(wallet: string): Promise<Array<string | null>> {
    const raw = await this.redis.get(this.loadoutKey(wallet));
    if (!raw) return Array<string | null>(FIGURE_SLOTS).fill(null);
    try {
      const slots = JSON.parse(raw) as unknown;
      if (Array.isArray(slots) && slots.length === FIGURE_SLOTS && slots.every(value => value === null || typeof value === 'string')) return slots;
    } catch {}
    return Array<string | null>(FIGURE_SLOTS).fill(null);
  }

  private async writeSlots(wallet: string, slots: Array<string | null>) {
    // Deliberately no TTL: an army is durable account preference, not game state.
    await this.redis.set(this.loadoutKey(wallet), JSON.stringify(slots));
  }

  private loadoutKey(wallet: string) { return `${this.prefix}:shop:loadout:${wallet}`; }
}

export function createFigureAssetSource(rpcUrl: string, collection: string | null, publicOrigin: string): FigureAssetSource {
  return {
    async listOwned(address) {
      if (!collection) return [];
      const assets: OwnedFigureAsset[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: `ripsy-inventory-${page}`, method: 'getAssetsByOwner', params: { ownerAddress: address, page, limit: 1000 } }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error('Figure inventory RPC is unavailable');
        const body = await response.json() as { error?: unknown; result?: { items?: unknown[] } };
        if (body.error || !Array.isArray(body.result?.items)) throw new Error('Figure inventory RPC does not support DAS getAssetsByOwner');
        for (const item of body.result.items) {
          const asset = parseAsset(item, collection, publicOrigin);
          if (asset) assets.push(asset);
        }
        if (body.result.items.length < 1000) break;
      }
      return assets.sort((left, right) => left.assetId.localeCompare(right.assetId));
    },
  };
}

function parseAsset(value: unknown, collection: string, publicOrigin: string): OwnedFigureAsset | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.interface !== 'MplCoreAsset' || item.burnt === true) return null;
  const grouping = Array.isArray(item.grouping) ? item.grouping : [];
  const belongs = grouping.some(entry => entry && typeof entry === 'object'
    && (entry as Record<string, unknown>).group_key === 'collection'
    && (entry as Record<string, unknown>).group_value === collection);
  if (!belongs) return null;
  const content = item.content && typeof item.content === 'object' ? item.content as Record<string, unknown> : {};
  const metadata = content.metadata && typeof content.metadata === 'object' ? content.metadata as Record<string, unknown> : {};
  const attributes = Array.isArray(metadata.attributes) ? metadata.attributes : [];
  const figure = attributes.find(attribute => attribute && typeof attribute === 'object'
    && (attribute as Record<string, unknown>).trait_type === 'Figure') as Record<string, unknown> | undefined;
  const jsonUri = typeof content.json_uri === 'string' ? content.json_uri : '';
  const byTrait = FIGURES.find(candidate => candidate.purchasable && figure?.value === candidate.id);
  let metadataPath = '';
  try { metadataPath = new URL(jsonUri).pathname; } catch {}
  const byUri = FIGURES.find(candidate => candidate.purchasable && metadataPath === `/figures/${candidate.id}.json`);
  if (byTrait && byUri && byTrait.id !== byUri.id) return null;
  const definition = byTrait ?? byUri;
  if (!definition || definition.id === 'fig1') return null;
  const links = content.links && typeof content.links === 'object' ? content.links as Record<string, unknown> : {};
  return {
    assetId: item.id,
    figureId: definition.id,
    variant: definition.variant,
    // The app's fighter name is canonical even for NFTs minted before a rename.
    name: definition.name,
    imageUrl: typeof links.image === 'string' ? links.image : `${publicOrigin}/figures/${definition.id}.png`,
  };
}
