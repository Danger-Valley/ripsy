import { randomUUID } from 'node:crypto';
import { PACK_PAYMENT } from '@rps/core/packs';
import type { AdminUsdRates } from '@rps/core/shop-admin';
import { FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import type { ShopRedis } from './shop-service.js';

export const SOL_PRICE_MINT = 'So11111111111111111111111111111111111111112';
const tokens = new Map([[SOL_PRICE_MINT, 9], [PACK_PAYMENT.mint, PACK_PAYMENT.decimals],
  ...Object.values(FIGURE_TOKEN_PAYMENTS).map(t => [t!.mint, t!.decimals] as [string, number])]);
const unavailable = (): AdminUsdRates => ({ source: 'Jupiter', fetchedAt: null, expiresAt: Date.now() + 15_000,
  rates: {}, error: 'USD rates are temporarily unavailable. Token prices are unchanged.' });

/** One batched backend feed, shared across replicas; no caller-selected mints/URLs. */
export class ShopUsdRatesService {
  private key: string;
  private inFlight: Promise<AdminUsdRates> | null = null;
  constructor(private redis: ShopRedis, private apiKey?: string, prefix = 'ripsy', private fetcher: typeof fetch = fetch) {
    this.key = `${prefix}:shop:admin:usd-rates:v1:${[...tokens.keys()].sort().join(',')}`;
  }
  get(): Promise<AdminUsdRates> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.read().catch(() => unavailable()).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  private async cached(): Promise<AdminUsdRates | null> {
    const raw = await this.redis.get(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw) as AdminUsdRates;
    return value.expiresAt > Date.now() ? value : null;
  }
  private async read(): Promise<AdminUsdRates> {
    const cached = await this.cached();
    if (cached) return cached;
    const lock = `${this.key}:lock`; const owner = randomUUID();
    if (!await this.redis.set(lock, owner, { NX: true, EX: 15 })) return await this.cached() ?? unavailable();
    try {
      const rates: AdminUsdRates['rates'] = {};
      const ids = [...tokens.keys()];
      // Abort the entire operation, not just each batch, within the lock lifetime.
      const signal = AbortSignal.timeout(5000);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const response = await this.fetcher(`https://api.jup.ag/price/v3?ids=${batch.join(',')}`, {
          signal, headers: this.apiKey ? { 'x-api-key': this.apiKey } : {},
        });
        if (!response.ok) throw new Error('Price provider unavailable');
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid price response');
        for (const mint of batch) {
          const row = (body as Record<string, unknown>)[mint];
          if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
          const { usdPrice, decimals, blockId } = row as Record<string, unknown>;
          if (typeof usdPrice !== 'number' || !Number.isFinite(usdPrice) || usdPrice <= 0 || decimals !== tokens.get(mint)
            || typeof blockId !== 'number' || !Number.isSafeInteger(blockId) || blockId <= 0) continue;
          rates[mint] = { usdPrice, decimals: decimals as number, blockId };
        }
      }
      const fetchedAt = Date.now();
      const result: AdminUsdRates = { source: 'Jupiter', fetchedAt, expiresAt: fetchedAt + 60_000, rates,
        error: Object.keys(rates).length ? null : 'No reliable USD rates returned. Try again shortly.' };
      await this.redis.set(this.key, JSON.stringify(result), { EX: 60 });
      return result;
    } catch {
      const result = unavailable();
      await this.redis.set(this.key, JSON.stringify(result), { EX: 15 });
      return result;
    } finally {
      await this.redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", { keys: [lock], arguments: [owner] });
    }
  }
}
