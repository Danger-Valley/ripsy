import { decimalToUnits } from '@rps/core/shop-admin';
import type { AdminFigure, AdminUsdRates } from '@rps/core/shop-admin';

export const SOL_PRICE_MINT = 'So11111111111111111111111111111111111111112';
/** Floating point is display-only. Payments still use exact decimalToUnits. */
export function usdEstimate(amount: string, mint: string | null, decimals: number, rates: AdminUsdRates | null, now = Date.now()): string {
  try { decimalToUnits(amount, decimals); } catch { return 'USD estimate appears for a valid price.'; }
  const rate = rates?.rates[mint ?? SOL_PRICE_MINT];
  if (!rates || now >= rates.expiresAt || !rate || rate.decimals !== decimals || !Number.isFinite(rate.usdPrice) || rate.usdPrice <= 0) return 'USD rate unavailable';
  const value = Number(amount) * rate.usdPrice;
  if (!Number.isFinite(value) || value <= 0) return 'USD estimate unavailable';
  if (value < 0.01) return '≈ < $0.01 USD';
  return `≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USD`;
}

export const adminApiOrigin = () => (process.env.NEXT_PUBLIC_SHOP_API_URL ?? 'https://api.ripsy.fun').replace(/\/$/, '');
export class AdminApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function adminRequest<T>(path: string, token?: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${adminApiOrigin()}/shop/admin/${path}`, { method, cache: 'no-store', signal: AbortSignal.timeout(90000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) throw new AdminApiError(typeof result.error === 'string' ? result.error : 'The admin request failed. Try again.', response.status);
  return result as T;
}
export function changedPrices(figures: AdminFigure[], draft: Record<string, string>) {
  const prices: Record<string, string> = {}; const errors: Record<string, string> = {};
  for (const f of figures) {
    if (draft[f.id] === f.price) continue;
    try {
      const amount = decimalToUnits(draft[f.id], f.decimals, f.mint ? undefined : BigInt(Number.MAX_SAFE_INTEGER));
      if (amount !== f.amount) prices[f.id] = draft[f.id]!;
    } catch (error) { errors[f.id] = (error as Error).message; }
  }
  return { prices, errors };
}
export function chanceWeight(value: string): number {
  if (/^0+(?:\.0{1,4})?$/.test(value.trim())) return 0;
  return Number(decimalToUnits(value, 4, 1_000_000n));
}
