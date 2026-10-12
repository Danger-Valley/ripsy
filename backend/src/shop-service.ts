import { createHash, randomUUID } from 'node:crypto';
import { publicKey } from '@metaplex-foundation/umi';
import { figureOrderQuantity, figureQuantityPrice, validateFigureQuantity, isFigureId, isTerminalMint, type MintOrder } from '@rps/core/shop';
import { FIGURES, FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import { shopCatalog, type ShopConfig } from './shop-config.js';
import type { ShopChain } from './shop-chain.js';
import { ShopError } from './shop-error.js';
import type { SeekerGate } from './seeker-verification.js';
import type { ShopPricingService } from './shop-pricing.js';
import { writePreparedOrder } from './shop-order-fence.js';
export { ShopError } from './shop-error.js';

export interface ShopRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}
interface StoredOrder { playerId: string; order: MintOrder; signed?: string }
const retention = 60 * 60 * 24 * 90;

export class ShopService {
  constructor(private redis: ShopRedis, private config: ShopConfig, private chain: ShopChain, private prefix = 'ripsy', private seeker?: SeekerGate, private pricing?: ShopPricingService) {}

  async liveCatalog(version = 3) {
    const catalog = this.pricing ? await this.pricing.catalog() : shopCatalog(this.config);
    catalog.figures = catalog.figures.filter(figure => version >= 4 || figure.variant <= (version < 2 ? 2 : version < 3 ? 4 : 5));
    return catalog;
  }

  catalog(version = 3) {
    const catalog = shopCatalog(this.config);
    // Existing native builds reject unknown figure IDs. Keep their browsing
    // usable while updated clients opt into the token-priced catalog.
    if (version < 2) catalog.figures = catalog.figures.filter(figure => figure.variant <= 2);
    else if (version < 3) catalog.figures = catalog.figures.filter(figure => figure.variant <= 4);
    else if (version < 4) catalog.figures = catalog.figures.filter(figure => figure.variant <= 5);
    return catalog;
  }

  async create(playerId: string, input: Record<string, unknown>): Promise<MintOrder> {
    if (!this.config.enabled) throw new ShopError('Minting is not available yet.', 503);
    const quantity = input.quantity === undefined ? 1 : input.quantity;
    try { validateFigureQuantity(quantity); } catch (error) { throw new ShopError((error as Error).message); }
    if (input.paymentMode !== undefined && input.paymentMode !== 'sol') throw new ShopError('Invalid payment method');
    if (!isFigureId(input.figureId) || !FIGURES.some(f => f.id === input.figureId)) throw new ShopError('Unknown figure');
    if (input.figureId === 'fig1') throw new ShopError('RIPSY 001 is free for every player and is not sold in the shop.', 409);
    if (!FIGURES.find(f => f.id === input.figureId)!.purchasable) throw new ShopError('This figure is not available for purchase.', 409);
    if (typeof input.buyer !== 'string') throw new ShopError('Connect a Solana wallet first');
    let buyer: string;
    try { buyer = String(publicKey(input.buyer)); } catch { throw new ShopError('Invalid wallet address'); }
    if (buyer === this.config.treasury || buyer === this.config.collection) throw new ShopError('Use a customer wallet for this purchase');
    if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) throw new ShopError('Invalid purchase request ID');
    const figureId = input.figureId;
    const id = createHash('sha256').update(`${playerId}:${input.idempotencyKey}`).digest('hex');
    return this.lock(id, async commit => {
      const existing = await this.read(id, playerId, false);
      if (existing) {
        if (existing.order.buyer !== buyer || existing.order.figureId !== figureId || figureOrderQuantity(existing.order) !== quantity) throw new ShopError('Purchase request already used', 409);
        return this.refresh(existing);
      }
      // Saved requests retain their exact original currency/quote, including
      // legacy SOL fig2 receipts. New SKR payments below remain mainnet-only.
      const quote = this.pricing ? await this.pricing.payment(figureId) : { price: FIGURE_TOKEN_PAYMENTS[figureId] ? '0' : this.config.prices[figureId], tokenPayment: FIGURE_TOKEN_PAYMENTS[figureId] };
      let total: ReturnType<typeof figureQuantityPrice>;
      try { total = figureQuantityPrice({ priceLamports: quote.price ?? null, tokenPayment: quote.tokenPayment }, quantity); }
      catch (error) { throw new ShopError((error as Error).message); }
      const { priceLamports: price, tokenPayment } = total;
      if (tokenPayment && this.config.cluster !== 'mainnet-beta') throw new ShopError('This figure is only available on the production store.', 409);
      if (!price) throw new ShopError('This figure is not available yet', 409);
      if (FIGURES.find(f => f.id === figureId)!.seekerExclusive) {
        if (!this.seeker) throw new ShopError('Seeker verification is temporarily unavailable. Try again shortly.', 503);
        await this.seeker.assertVerified(playerId, buyer);
      }
      const bucket = `${this.prefix}:shop:rate:${playerId}:${Math.floor(Date.now() / 60_000)}`;
      const count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n", { keys: [bucket], arguments: [] }));
      if (count > 8) throw new ShopError('Too many mint requests. Wait a minute and try again.', 429);
      const prepared = quantity === 1
        ? await this.chain.prepare(figureId, buyer, price, tokenPayment, input.paymentMode as 'sol' | undefined)
        : await this.chain.prepare(figureId, buyer, price, tokenPayment, input.paymentMode as 'sol' | undefined, quantity);
      if (quantity > 1 && (!prepared.assets || prepared.assets.length !== quantity || prepared.assets[0] !== prepared.asset || new Set(prepared.assets).size !== quantity)) throw new ShopError('Could not prepare all selected figures. No payment was sent.', 503);
      const order: MintOrder = {
        id, figureId, buyer, ...prepared, cluster: this.config.cluster, priceLamports: price,
        ...(quantity > 1 ? { quantity } : {}),
        ...(tokenPayment ? { tokenPayment: { ...tokenPayment } } : {}),
        treasury: this.config.treasury!, collection: this.config.collection!, createdAt: Date.now(),
        status: 'prepared', signature: null, error: null,
      };
      await commit({ playerId, order });
      return order;
    });
  }

  async get(playerId: string, id: string) {
    return this.lock(id, async () => this.refresh((await this.read(id, playerId))!));
  }

  async submit(playerId: string, id: string, signed: unknown) {
    if (typeof signed !== 'string') throw new ShopError('A signed purchase is required');
    return this.lock(id, async () => {
      const stored = (await this.read(id, playerId))!;
      const order = await this.refresh(stored);
      if (isTerminalMint(order)) return order;
      const signature = this.chain.validateSigned(order, signed);
      if (order.signature && signature !== order.signature) throw new ShopError('A different transaction is already pending', 409);
      order.signature = signature;
      order.status = 'submitted';
      stored.signed = signed;
      // Persist BEFORE touching the chain. Any replica can recover the exact
      // signed bytes after a lost response, crash or mobile app restart.
      await this.write(stored);
      try { await this.chain.send(signed); } catch {
        // Transport failure is ambiguous. Keep this purchase pending and query
        // its recorded signature; never manufacture a replacement transaction.
      }
      return this.refresh(stored);
    });
  }

  private async refresh(stored: StoredOrder): Promise<MintOrder> {
    const order = stored.order;
    if (isTerminalMint(order)) return order;
    const state = await this.chain.status(order);
    if (state !== 'pending') {
      order.status = state;
      order.error = state === 'failed' ? 'The transaction failed. The figure price was not charged; network fees may apply.'
        : state === 'expired' ? 'This purchase expired without confirmation. You can start a new purchase.' : null;
      delete stored.signed;
      await this.write(stored);
    } else if (stored.signed) {
      // Re-broadcast only identical bytes, so retries cannot mint or charge twice.
      await this.chain.send(stored.signed).catch(() => undefined);
    }
    return order;
  }

  private async read(id: string, playerId: string, required = true): Promise<StoredOrder | null> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ShopError('Purchase not found', 404);
    const value = await this.redis.get(`${this.prefix}:shop:order:${id}`);
    if (!value) { if (required) throw new ShopError('Purchase not found', 404); return null; }
    const stored = JSON.parse(value) as StoredOrder;
    if (stored.playerId !== playerId) throw new ShopError('Purchase not found', 404);
    if (stored.order.cluster !== this.config.cluster) throw new ShopError('This purchase belongs to a different network. Contact support before starting another purchase.', 409);
    return stored;
  }

  private async write(stored: StoredOrder) {
    await this.redis.set(`${this.prefix}:shop:order:${stored.order.id}`, JSON.stringify(stored), { EX: retention });
  }

  private async lock<T>(id: string, operation: (commit: (stored: StoredOrder) => Promise<void>) => Promise<T>): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ShopError('Purchase not found', 404);
    const key = `${this.prefix}:shop:lock:${id}`;
    const token = randomUUID();
    if (!await this.redis.set(key, token, { NX: true, EX: 120 })) throw new ShopError('Purchase is updating. Try again in a moment.', 409);
    try { return await operation(stored => writePreparedOrder(this.redis, key, token, `${this.prefix}:shop:order:${id}`, JSON.stringify(stored), retention)); } finally {
      await this.redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", { keys: [key], arguments: [token] });
    }
  }
}
