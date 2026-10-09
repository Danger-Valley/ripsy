import { decimalToUnits } from '@rps/core/shop-admin';
import type { AdminFigure } from '@rps/core/shop-admin';

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
