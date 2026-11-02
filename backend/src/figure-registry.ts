import { readFileSync } from 'node:fs';
import { parseFigureManifest } from '@rps/core/figure-manifest';
import { isSafeShopExternalUrl, parseShopCatalog, type TokenPayment } from '@rps/core/shop';

export interface Registration {
  id: string; name: string; description: string; variant: number;
  purchasable: boolean; seekerExclusive: boolean;
  tokenPayment?: TokenPayment;
  priceLamports?: string;
  animation: { sha256: string; bytes: number };
  portrait?: { sha256: string; bytes: number };
  resources?: { rive: string; png: string; metadata: string };
}
/** Backend-owned allowlist. Never recycle an ID or variant once published. */
export const FIGURES: Registration[] = JSON.parse(
  readFileSync(new URL('./figure-registry.json', import.meta.url), 'utf8'),
);
if (!Array.isArray(FIGURES)) throw new Error('Invalid figure registry');
export const BUILTIN_FIGURES: ReadonlyArray<Registration> = structuredClone(FIGURES);
// Validate before starting the server, not during a user's purchase.
export function validateRegistrations(figures: Registration[]) {
for (const f of figures) if (f.resources && !Object.values(f.resources).every(isSafeShopExternalUrl)) throw new Error('Invalid figure resources');
parseFigureManifest({ schema: 1, figures: figures.map(f => ({
  ...f, imageUrl: `https://registry.invalid/figures/${f.id}.png`,
  ...(f.portrait ? { portrait: { ...f.portrait, url: `https://registry.invalid/figures/${f.id}.png` } } : {}),
  animation: { ...f.animation, contract: 1, url: `https://registry.invalid/figures/${f.id}.riv` },
})) });
parseShopCatalog({ cluster: 'mainnet-beta', treasury: null, collection: null,
  figures: figures.map(f => ({ ...f, imageUrl: `https://registry.invalid/figures/${f.id}.png`, priceLamports: f.tokenPayment ? '0' : f.priceLamports ?? null, available: false })),
});
}
validateRegistrations(FIGURES);
export const FIGURE_TOKEN_PAYMENTS: Partial<Record<string, TokenPayment>> = Object.fromEntries(
  FIGURES.filter(f => f.tokenPayment).map(f => [f.id, f.tokenPayment!]),
);
export function figureVariantForId(id: string): number {
  const figure = FIGURES.find(f => f.id === id);
  if (!figure) throw new Error('Unknown registered figure');
  return figure.variant;
}
/** Synchronous atomic replacement: all existing imports keep the same array/map. */
export function installAdminFigures(additions: Registration[]) {
  const next = [...BUILTIN_FIGURES, ...additions]; validateRegistrations(next);
  for (const old of FIGURES) {
    const found = next.find(f => f.id === old.id);
    if (!found || found.variant !== old.variant) throw new Error('Published figure identities cannot be removed or remapped');
  }
  FIGURES.splice(0, FIGURES.length, ...next);
  for (const key of Object.keys(FIGURE_TOKEN_PAYMENTS)) delete FIGURE_TOKEN_PAYMENTS[key];
  for (const figure of next) if (figure.tokenPayment) FIGURE_TOKEN_PAYMENTS[figure.id] = figure.tokenPayment;
}
export function registeredFigureUrls(figure: Registration, origin: string) {
  return figure.resources ?? { rive: `${origin}/figures/${figure.id}.riv`, png: `${origin}/figures/${figure.id}.png`, metadata: `${origin}/figures/${figure.id}.json` };
}
