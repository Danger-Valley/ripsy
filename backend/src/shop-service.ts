import { createHash, randomUUID } from 'node:crypto';
import { publicKey } from '@metaplex-foundation/umi';
import { isFigureId, isTerminalMint, type MintOrder } from '@rps/core/shop';
import { shopCatalog, type ShopConfig } from './shop-config.js';
import type { ShopChain } from './shop-chain.js';
import { ShopError } from './shop-error.js';
import type { SeekerGate } from './seeker-verification.js';
export { ShopError } from './shop-error.js';

export interface ShopRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}
interface StoredOrder { playerId: string; order: MintOrder; signed?: string }
const retention = 60 * 60 * 24 * 90;

export class ShopService {
  constructor(private redis: ShopRedis, private config: ShopConfig, private chain: ShopChain, private prefix = 'ripsy', private seeker?: SeekerGate) {}

  catalog() { return shopCatalog(this.config); }

  async create(playerId: string, input: Record<string, unknown>): Promise<MintOrder> {
    if (!this.config.enabled) throw new ShopError('Minting is not available yet.', 503);
    if (!isFigureId(input.figureId)) throw new ShopError('Unknown figure');
    if (input.figureId === 'fig1') throw new ShopError('Figure 01 is free for every player and is not sold in the shop.', 409);
    if (typeof input.buyer !== 'string') throw new ShopError('Connect a Solana wallet first');
    let buyer: string;
    try { buyer = String(publicKey(input.buyer)); } catch { throw new ShopError('Invalid wallet address'); }
    if (buyer === this.config.treasury || buyer === this.config.collection) throw new ShopError('Use a customer wallet for this purchase');
    if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) throw new ShopError('Invalid purchase request ID');
    const figureId = input.figureId;
    const price = this.config.prices[figureId];
    if (!price) throw new ShopError('This figure is not available yet', 409);
    const id = createHash('sha256').update(`${playerId}:${input.idempotencyKey}`).digest('hex');
    return this.lock(id, async () => {
      const existing = await this.read(id, playerId, false);
      if (existing) {
        if (existing.order.buyer !== buyer || existing.order.figureId !== figureId) throw new ShopError('Purchase request already used', 409);
        return this.refresh(existing);
      }
      if (figureId === 'fig2') {
        if (!this.seeker) throw new ShopError('Seeker verification is temporarily unavailable. Try again shortly.', 503);
        await this.seeker.assertVerified(playerId, buyer);
      }
      const bucket = `${this.prefix}:shop:rate:${playerId}:${Math.floor(Date.now() / 60_000)}`;
      const count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n", { keys: [bucket], arguments: [] }));
      if (count > 8) throw new ShopError('Too many mint requests. Wait a minute and try again.', 429);
      const prepared = await this.chain.prepare(figureId, buyer, price);
      const order: MintOrder = {
        id, figureId, buyer, ...prepared, cluster: this.config.cluster, priceLamports: price,
        treasury: this.config.treasury!, collection: this.config.collection!, createdAt: Date.now(),
        status: 'prepared', signature: null, error: null,
      };
      await this.write({ playerId, order });
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

  private async lock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ShopError('Purchase not found', 404);
    const key = `${this.prefix}:shop:lock:${id}`;
    const token = randomUUID();
    if (!await this.redis.set(key, token, { NX: true, EX: 120 })) throw new ShopError('Purchase is updating. Try again in a moment.', 409);
    try { return await operation(); } finally {
      await this.redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", { keys: [key], arguments: [token] });
    }
  }
}
