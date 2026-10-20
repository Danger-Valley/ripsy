import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { publicKey } from '@metaplex-foundation/umi';
import { isTerminalPack, parsePackOrder, type PackDrop, type PackOrder } from '@rps/core/packs';
import { FIGURES } from './figure-registry.js';
import { ShopError } from './shop-error.js';
import type { ShopRedis } from './shop-service.js';
import type { BackendPackSettingsService } from './backend-pack-settings.js';
import type { BackendPackChain, PackDelivery, PackReward } from './backend-pack-chain.js';
import type { PackChain } from './pack-chain.js';

interface Stored {
  engine?: 'backend-v1'; playerId: string; nonce: string; order: PackOrder;
  paid?: boolean; rewards?: PackReward[]; signed?: string; delivery?: PackDelivery;
}
export const PACK_ORDER_WRITE = `-- backend-pack-order-write
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
if tonumber(ARGV[3]) > 0 then redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]) else redis.call('SET',KEYS[2],ARGV[2]) end
if ARGV[6] == '1' then redis.call('ZREM',KEYS[3],ARGV[5]) else redis.call('ZADD',KEYS[3],ARGV[4],ARGV[5]) end
return 1`;

/** Rejection sampling avoids modulo bias; the saved entropy reproduces one draw. */
export function backendPackResult(entropy: Uint8Array, drops: PackDrop[]): string {
  if (entropy.length !== 32 || drops.reduce((sum, drop) => sum + drop.weight, 0) !== 1_000_000) throw new Error('Invalid pack draw');
  const limit = 0x100000000 - (0x100000000 % 1_000_000);
  for (let counter = 0; counter < 1024; counter++) {
    const suffix = Buffer.alloc(4); suffix.writeUInt32BE(counter);
    const sample = createHash('sha256').update(entropy).update(suffix).digest().readUInt32BE(0);
    if (sample >= limit) continue;
    const ticket = sample % 1_000_000;
    let upper = 0;
    for (const drop of drops) { upper += drop.weight; if (ticket < upper) return drop.figureId; }
  }
  throw new Error('Could not resolve the saved pack');
}

export class BackendPackService {
  constructor(private redis: ShopRedis, private settings: BackendPackSettingsService, private chain: BackendPackChain,
    private enabled: boolean, private origin: string, private prefix = 'ripsy', private legacy?: Pick<PackChain, 'status'>,
    private entropy: () => Uint8Array = () => randomBytes(32)) {}
  async catalog() { return { ...await this.settings.catalog(this.enabled), deliveryPayment: 'buyer-prepaid' as const }; }
  async recoverDue(onError: (error: unknown) => void = () => undefined) {
    const ids = await this.redis.eval("return redis.call('ZRANGEBYSCORE',KEYS[1],'-inf',ARGV[1],'LIMIT',0,5)",
      { keys: [`${this.prefix}:packs:pending`], arguments: [String(Date.now())] }) as string[];
    await Promise.all(ids.map(id => this.lock(id, async save => {
      const raw = await this.redis.get(this.orderKey(id));
      if (!raw) { await this.redis.eval("return redis.call('ZREM',KEYS[1],ARGV[1])", { keys: [`${this.prefix}:packs:pending`], arguments: [id] }); return; }
      const stored = JSON.parse(raw) as Stored;
      await save(stored); // Move retry time before RPC work, across replicas.
      await this.refresh(stored, save);
    }).catch(onError)));
  }
  async create(playerId: string, input: Record<string, unknown>) {
    if (input.paymentMode !== undefined && input.paymentMode !== 'sol') throw new ShopError('Invalid payment method');
    if (typeof input.buyer !== 'string' || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) throw new ShopError('Invalid pack purchase');
    let buyer: string;
    try { buyer = String(publicKey(input.buyer)); } catch { throw new ShopError('Invalid purchase account'); }
    const id = createHash('sha256').update(`${playerId}:${input.idempotencyKey}`).digest('hex');
    return this.lock(id, async save => {
      const existing = await this.read(id, playerId, false);
      if (existing) {
        if (existing.order.buyer !== buyer) throw new ShopError('Purchase request already used', 409);
        return this.refresh(existing, save);
      }
      const catalog = await this.catalog();
      if (!catalog.available) throw new ShopError('Packs are not available yet.', 503);
      const count = Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],120) end;return n",
        { keys: [`${this.prefix}:packs:rate:${playerId}:${Math.floor(Date.now() / 60000)}`], arguments: [] }));
      if (count > 8) throw new ShopError('Too many pack requests. Wait a minute.', 429);
      const rewards = catalog.drops.map(drop => {
        const figure = FIGURES.find(f => f.id === drop.figureId && f.purchasable && !f.seekerExclusive);
        if (!figure) throw new ShopError('Pack delivery is temporarily unavailable.', 503);
        return { figureId: figure.id, name: figure.name, uri: `${this.origin}/figures/${figure.id}.json` };
      });
      // Private seed is stored only on the server; neither it nor delivery bytes
      // are included in the public order. Result entropy is entirely separate.
      const nonce = randomBytes(32).toString('hex');
      const quote = await this.chain.prepare(buyer, id, nonce, structuredClone(catalog), input.paymentMode as 'sol' | undefined, rewards);
      const order: PackOrder = { ...quote, id, status: 'prepared', createdAt: Date.now(), signature: null, result: null, randomness: null };
      parsePackOrder(order);
      await save({ engine: 'backend-v1', playerId, nonce, rewards, paid: false, order });
      return order;
    });
  }
  get(playerId: string, id: string) { return this.lock(id, async save => this.refresh((await this.read(id, playerId))!, save)); }
  submit(playerId: string, id: string, signed: unknown) {
    return this.lock(id, async save => {
      const stored = (await this.read(id, playerId))!;
      const current = await this.refresh(stored, save);
      if (isTerminalPack(current) || stored.paid) return current;
      if (stored.engine !== 'backend-v1') throw new ShopError('This earlier pack cannot be approved. Check its status.', 409);
      if (typeof signed !== 'string') throw new ShopError('Purchase approval required');
      const signature = this.chain.validateSigned(current, signed);
      if (current.signature && current.signature !== signature) throw new ShopError('Another purchase approval is already pending', 409);
      stored.order = { ...current, signature, status: 'submitted' }; stored.signed = signed;
      await save(stored); // Durable before any payment broadcast.
      await this.chain.send(signed).catch(() => undefined);
      return this.refresh(stored, save);
    });
  }
  private async refresh(stored: Stored, save: (value: Stored) => Promise<void>): Promise<PackOrder> {
    if (isTerminalPack(stored.order)) return stored.order;
    if (stored.engine !== 'backend-v1') {
      // The retired program had no paid receipts. Reconcile unsigned/failed
      // historical intents read-only, never rebroadcast a retired-program call.
      if (!this.legacy) throw new ShopError('This earlier purchase needs a status check.', 503);
      Object.assign(stored.order, await this.legacy.status(stored.order));
      await save(stored); return stored.order;
    }
    if (!stored.paid) {
      const payment = await this.chain.paymentStatus(stored.order);
      stored.order.signature = payment.signature;
      if (payment.status !== 'paid') {
        stored.order.status = payment.status === 'pending' ? (payment.signature ? 'submitted' : 'prepared') : payment.status;
        await save(stored);
        if (payment.status === 'pending' && stored.signed) await this.chain.send(stored.signed).catch(() => undefined);
        return stored.order;
      }
      stored.paid = true; delete stored.signed; stored.order.status = 'waiting-result';
      await save(stored); // A paid entitlement never expires or receives a TTL.
    }
    if (!stored.order.result) {
      const entropy = this.entropy();
      stored.order.result = backendPackResult(entropy, stored.order.drops);
      stored.order.randomness = Buffer.from(entropy).toString('hex');
      stored.order.status = 'ready-to-claim';
      await save(stored); // Commit one draw before exposing it or creating an asset.
    }
    let status = stored.delivery ? await this.chain.deliveryStatus(stored.order, stored.delivery) : null;
    if (status === 'confirmed') { stored.order.status = 'confirmed'; await save(stored); return stored.order; }
    if (!stored.delivery || status === 'expired' || status === 'failed') {
      const reward = stored.rewards?.find(f => f.figureId === stored.order.result);
      if (!reward) throw new ShopError('Your saved pack needs delivery assistance. Do not purchase again.', 503);
      stored.delivery = await this.chain.prepareDelivery(stored.order, stored.nonce, reward);
      await save(stored); // Signed, fixed-asset delivery is durable before broadcast.
    }
    await this.chain.send(stored.delivery.transaction).catch(() => undefined);
    status = await this.chain.deliveryStatus(stored.order, stored.delivery);
    if (status === 'confirmed') { stored.order.status = 'confirmed'; await save(stored); }
    return stored.order;
  }
  private orderKey(id: string) { return `${this.prefix}:packs:order:${id}`; }
  private async read(id: string, playerId: string, required = true): Promise<Stored | null> {
    const raw = await this.redis.get(this.orderKey(id));
    if (!raw) { if (required) throw new ShopError('Pack purchase not found', 404); return null; }
    const value = JSON.parse(raw) as Stored;
    if (value.playerId !== playerId) throw new ShopError('Pack purchase not found', 404);
    parsePackOrder(value.order); return value;
  }
  private async lock<T>(id: string, action: (save: (stored: Stored) => Promise<void>) => Promise<T>): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ShopError('Pack purchase not found', 404);
    const lock = `${this.prefix}:packs:lock:${id}`, token = randomUUID();
    if (!await this.redis.set(lock, token, { NX: true, EX: 120 })) throw new ShopError('Purchase is updating. Check again shortly.', 409);
    try { return await action(async stored => {
      const terminal = isTerminalPack(stored.order);
      // Keep paid receipts, snapshots and results permanently, including after
      // successful delivery. Only terminal unpaid intents may age out.
      const ttl = terminal && !stored.paid ? 90 * 86400 : 0;
      if (Number(await this.redis.eval(PACK_ORDER_WRITE, { keys: [lock, this.orderKey(id), `${this.prefix}:packs:pending`],
        arguments: [token, JSON.stringify(stored), String(ttl), String(Date.now() + 15000), id, terminal ? '1' : '0'] })) !== 1)
        throw new ShopError('Purchase is updating. Check its saved status.', 409);
    }); } finally { await this.redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", { keys: [lock], arguments: [token] }); }
  }
}
