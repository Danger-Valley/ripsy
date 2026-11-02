import { isFigureId, isSafeShopExternalUrl } from '@rps/core/shop';

/** Contract 1 is the existing Front/Back, Weapon and action-trigger contract. */
export interface FigureResource { url: string; sha256: string; bytes: number }
export interface FigureDefinition {
  id: string;
  variant: number;
  name: string;
  description: string;
  purchasable: boolean;
  seekerExclusive: boolean;
  imageUrl: string;
  animation: FigureResource & { contract: 1 };
  /** Optional for rolling compatibility with manifests published before PNG caching. */
  portrait?: FigureResource;
}
export interface FigureManifest { schema: 1; figures: FigureDefinition[] }
function validResource(resource: FigureResource | undefined, limit: number) {
  return resource && isSafeShopExternalUrl(resource.url) && /^[a-f0-9]{64}$/.test(resource.sha256)
    && Number.isSafeInteger(resource.bytes) && resource.bytes >= 8 && resource.bytes <= limit;
}
export function isModelVariant(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 255;
}
export function parseFigureManifest(value: unknown): FigureManifest {
  const m = value as FigureManifest;
  if (!m || m.schema !== 1 || !Array.isArray(m.figures) || !m.figures.length || m.figures.length > 255) throw new Error('Invalid figure catalog');
  const ids = new Set<string>(), variants = new Set<number>();
  for (const f of m.figures) {
    if (!f || !isFigureId(f.id) || !isModelVariant(f.variant) || ids.has(f.id) || variants.has(f.variant)
      || typeof f.name !== 'string' || !f.name.length || f.name.length > 100
      || typeof f.description !== 'string' || f.description.length > 2000
      || typeof f.purchasable !== 'boolean' || typeof f.seekerExclusive !== 'boolean'
      || !isSafeShopExternalUrl(f.imageUrl) || !validResource(f.animation, 8 * 1024 * 1024)
      || f.animation.contract !== 1
      || (f.portrait !== undefined && (!validResource(f.portrait, 4 * 1024 * 1024) || f.portrait.url !== f.imageUrl))
      || ((f.id === 'fig1' || f.variant === 1) && !(f.id === 'fig1' && f.variant === 1 && !f.purchasable && !f.seekerExclusive))) throw new Error('Invalid figure catalog');
    ids.add(f.id); variants.add(f.variant);
  }
  if (!ids.has('fig1')) throw new Error('Invalid figure catalog');
  return m;
}
