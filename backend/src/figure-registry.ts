import { readFileSync } from 'node:fs';
import { parseFigureManifest } from '@rps/core/figure-manifest';
import { parseShopCatalog, type TokenPayment } from '@rps/core/shop';

interface Registration {
  id: string; name: string; description: string; variant: number;
  purchasable: boolean; seekerExclusive: boolean;
  tokenPayment?: TokenPayment;
  priceLamports?: string;
  animation: { sha256: string; bytes: number };
}
/** Backend-owned allowlist. Never recycle an ID or variant once published. */
export const FIGURES: Registration[] = JSON.parse(
  readFileSync(new URL('./figure-registry.json', import.meta.url), 'utf8'),
);
if (!Array.isArray(FIGURES)) throw new Error('Invalid figure registry');
// Validate before starting the server, not during a user's purchase.
parseFigureManifest({ schema: 1, figures: FIGURES.map(f => ({
  ...f, imageUrl: `https://registry.invalid/figures/${f.id}.png`,
  animation: { ...f.animation, contract: 1, url: `https://registry.invalid/figures/${f.id}.riv` },
})) });
parseShopCatalog({ cluster: 'mainnet-beta', treasury: null, collection: null,
  figures: FIGURES.map(f => ({ ...f, imageUrl: `https://registry.invalid/figures/${f.id}.png`, priceLamports: f.tokenPayment ? '0' : f.priceLamports ?? null, available: false })),
});
export const FIGURE_TOKEN_PAYMENTS: Partial<Record<string, TokenPayment>> = Object.fromEntries(
  FIGURES.filter(f => f.tokenPayment).map(f => [f.id, f.tokenPayment!]),
);
export function figureVariantForId(id: string): number {
  const figure = FIGURES.find(f => f.id === id);
  if (!figure) throw new Error('Unknown registered figure');
  return figure.variant;
}
