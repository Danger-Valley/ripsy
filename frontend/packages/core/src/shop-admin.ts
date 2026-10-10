import type { PackCatalog, PackDrop } from '@rps/core/packs';
import type { ShopCluster } from '@rps/core/shop';

/** Decimal strings only. Never round operator-entered payment amounts. */
export function decimalToUnits(value: unknown, decimals: number, maximum = 18_446_744_073_709_551_615n): string {
  if (typeof value !== 'string' || value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('Enter a positive decimal amount, without commas or exponents.');
  const [whole, fraction = ''] = value.trim().split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const amount = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount <= 0n || amount > maximum) throw new Error('The amount is outside the supported range.');
  return amount.toString();
}
export function unitsToDecimal(value: string, decimals: number): string {
  const amount = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const fraction = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${amount / base}${fraction ? `.${fraction}` : ''}`;
}
export interface AdminFigure {
  id: string; name: string; imageUrl: string; symbol: string; decimals: number;
  mint: string | null; price: string; amount: string | null; packEligible: boolean;
}
export interface AdminPrices {
  revision: number; figures: AdminFigure[];
  audit: Array<{ at: number; address: string; revision: number; changes: Record<string, { before: string | null; after: string; currency?: AdminPriceCurrency }> }>;
}
/** Price overrides/history carry units so a later currency change cannot reinterpret them. */
export interface AdminPriceCurrency { mint: string | null; symbol: string; decimals: number }
export interface AdminPackDraft { expectedVersion: number; price: string; drops: PackDrop[] }
export interface AdminPackPriceDraft { expectedVersion: number; expectedPrice: string; expectedRevision: string; price: string }
export interface AdminPublication {
  id: string; buyer: string; cluster: 'mainnet-beta'; transaction: string;
  edition: string; catalog: PackCatalog; lastValidBlockHeight: number;
  networkFeeLamports: string; createdAt: number;
  status: 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'expired' | 'superseded';
  signature: string | null;
  /** Missing kind denotes an existing edition publication, for durable recovery. */
  kind?: 'edition' | 'price';
  priceUpdate?: { account: string; expectedPrice: string; expectedRevision: string; revision: string };
}
export interface AdminSnapshot {
  cluster: ShopCluster; prices: AdminPrices; pack: PackCatalog | null; packError: string | null;
  packPriceRevision?: string;
}
/** Display-only mainnet reference prices. Never used to build a payment. */
export interface AdminUsdRates {
  source: 'Jupiter'; fetchedAt: number | null; expiresAt: number;
  rates: Record<string, { usdPrice: number; decimals: number; blockId: number }>;
  error: string | null;
}
