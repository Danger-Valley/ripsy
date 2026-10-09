import { decimalToUnits, unitsToDecimal, type AdminPrices } from '@rps/core/shop-admin';
import type { ShopCatalog, TokenPayment } from '@rps/core/shop';
import { FIGURES, FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import { shopCatalog, type ShopConfig } from './shop-config.js';
import { ShopError } from './shop-error.js';
import type { ShopRedis } from './shop-service.js';

interface PriceState { revision: number; amounts: Record<string, string>; audit: AdminPrices['audit'] }
const INITIAL: PriceState = { revision: 0, amounts: {}, audit: [] };
// Revision + prices + bounded audit commit together. Works across backend replicas.
export const PRICE_CAS = `-- shop-price-cas
local old = redis.call('GET', KEYS[1]); local revision = 0
if old then revision = cjson.decode(old).revision end
if revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2]); return 1`;

export class ShopPricingService {
  private key: string;
  constructor(private redis: ShopRedis, private config: ShopConfig, prefix = 'ripsy') { this.key = `${prefix}:shop:admin:prices`; }
  private async state(): Promise<PriceState> {
    const raw = await this.redis.get(this.key);
    return raw ? JSON.parse(raw) as PriceState : structuredClone(INITIAL);
  }
  private quote(id: string, state: PriceState): { price: string | null; tokenPayment?: TokenPayment } {
    const token = FIGURE_TOKEN_PAYMENTS[id];
    return token ? { price: '0', tokenPayment: { ...token, amount: state.amounts[id] ?? token.amount } }
      : { price: state.amounts[id] ?? this.config.prices[id] ?? null };
  }
  async payment(id: string) { return this.quote(id, await this.state()); }
  async catalog(): Promise<ShopCatalog> {
    const state = await this.state();
    const catalog = shopCatalog(this.config);
    catalog.figures = catalog.figures.map(figure => {
      const quote = this.quote(figure.id, state);
      return { ...figure, priceLamports: quote.price, ...(quote.tokenPayment ? { tokenPayment: quote.tokenPayment } : {}),
        available: this.config.enabled && (quote.tokenPayment ? this.config.cluster === 'mainnet-beta' : Boolean(quote.price)) };
    });
    return catalog;
  }
  async get(): Promise<AdminPrices> {
    const state = await this.state();
    return { revision: state.revision, audit: state.audit, figures: FIGURES.filter(f => f.purchasable).map(f => {
      const q = this.quote(f.id, state); const amount = q.tokenPayment?.amount ?? q.price;
      const decimals = q.tokenPayment?.decimals ?? 9;
      return { id: f.id, name: f.name, imageUrl: `${this.config.publicOrigin}/figures/${f.id}.png`,
        symbol: q.tokenPayment?.symbol ?? 'SOL', decimals, mint: q.tokenPayment?.mint ?? null,
        amount, price: amount ? unitsToDecimal(amount, decimals) : '', packEligible: !f.seekerExclusive };
    }) };
  }
  async save(address: string, input: Record<string, unknown>): Promise<AdminPrices> {
    if (!Number.isSafeInteger(input.revision) || !input.prices || typeof input.prices !== 'object' || Array.isArray(input.prices)) throw new ShopError('Invalid price update.');
    const state = await this.state();
    if (input.revision !== state.revision) throw new ShopError('Prices changed in another session. Reload before saving.', 409);
    const changes: AdminPrices['audit'][number]['changes'] = {};
    const entries = Object.entries(input.prices);
    if (!entries.length || entries.length > FIGURES.length) throw new ShopError('No valid prices to save.');
    for (const [id, price] of entries) {
      if (!FIGURES.some(f => f.id === id && f.purchasable)) throw new ShopError('Only registered purchasable figures can be priced.');
      const q = this.quote(id, state); let amount: string;
      try { amount = decimalToUnits(price, q.tokenPayment?.decimals ?? 9, q.tokenPayment ? undefined : BigInt(Number.MAX_SAFE_INTEGER)); }
      catch (error) { throw new ShopError(`${id}: ${(error as Error).message}`); }
      const before = q.tokenPayment?.amount ?? q.price;
      if (before !== amount) changes[id] = { before, after: amount };
    }
    if (!Object.keys(changes).length) return this.get();
    const next: PriceState = { revision: state.revision + 1, amounts: { ...state.amounts },
      audit: [{ at: Date.now(), address, revision: state.revision + 1, changes }, ...state.audit].slice(0, 200) };
    for (const [id, change] of Object.entries(changes)) next.amounts[id] = change.after;
    const saved = await this.redis.eval(PRICE_CAS, { keys: [this.key], arguments: [String(state.revision), JSON.stringify(next)] });
    if (Number(saved) !== 1) throw new ShopError('Prices changed in another session. Reload before saving.', 409);
    return this.get();
  }
}
