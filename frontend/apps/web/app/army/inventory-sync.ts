import type { OwnedFigureAsset } from '@rps/core/shop';

export const FIGURE_INVENTORY_REFRESH_MS = 2 * 60 * 1000;

export function retainOwnedFigureSlots(slots: Array<string | null>, assets: OwnedFigureAsset[]) {
  const owned = new Set(assets.map(asset => asset.assetId));
  return slots.map(assetId => assetId && owned.has(assetId) ? assetId : null);
}
