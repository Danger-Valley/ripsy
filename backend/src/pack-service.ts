import { createHash, randomBytes, randomUUID } from "node:crypto";
import { publicKey } from "@metaplex-foundation/umi";
import { isTerminalPack, type PackOrder } from "@rps/core/packs";
import type { ShopRedis } from "./shop-service.js";
import { ShopError } from "./shop-error.js";
import type { PackChain } from "./pack-chain.js";
interface Stored {
  playerId: string;
  nonce: string;
  order: PackOrder;
  signed?: string;
  claim?: { transaction: string; lastValidBlockHeight: number };
}
export class PackService {
  constructor(
    private redis: ShopRedis,
    private chain: PackChain,
    private prefix = "ripsy"
  ) {}
  catalog() {
    return this.chain.catalog();
  }
  /** Redis-backed recovery continues when the buyer closes the app. */
  async recoverDue(onError: (error: unknown) => void = () => undefined) {
    const ids = (await this.redis.eval(
      "return redis.call('ZRANGEBYSCORE',KEYS[1],'-inf',ARGV[1],'LIMIT',0,5)",
      {
        keys: [`${this.prefix}:packs:pending`],
        arguments: [String(Date.now())],
      }
    )) as string[];
    await Promise.all(
      ids.map((id) =>
        this.lock(id, async () => {
          const raw = await this.redis.get(`${this.prefix}:packs:order:${id}`);
          if (!raw) {
            await this.redis.eval("return redis.call('ZREM',KEYS[1],ARGV[1])", {
              keys: [`${this.prefix}:packs:pending`],
              arguments: [id],
            });
            return;
          }
          const s = JSON.parse(raw) as Stored;
          await this.redis.eval(
            "return redis.call('ZADD',KEYS[1],ARGV[1],ARGV[2])",
            {
              keys: [`${this.prefix}:packs:pending`],
              arguments: [String(Date.now() + 30_000), id],
            }
          );
          await this.refresh(s);
        }).catch(onError)
      )
    );
  }
  async create(playerId: string, input: Record<string, unknown>) {
    if (
      typeof input.buyer !== "string" ||
      typeof input.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)
    )
      throw new ShopError("Invalid pack purchase");
    let buyer: string;
    try {
      buyer = String(publicKey(input.buyer));
    } catch {
      throw new ShopError("Invalid purchase account");
    }
    const id = createHash("sha256")
      .update(`${playerId}:${input.idempotencyKey}`)
      .digest("hex");
    return this.lock(id, async () => {
      const existing = await this.read(id, playerId, false);
      if (existing) {
        if (existing.order.buyer !== buyer)
          throw new ShopError("Purchase request already used", 409);
        return this.refresh(existing);
      }
      // Rate limit before RPC work. No hardware/SGT or client price/weights.
      const bucket = `${this.prefix}:packs:rate:${playerId}:${Math.floor(
        Date.now() / 60_000
      )}`;
      const count = Number(
        await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],120) end;return n",
          { keys: [bucket], arguments: [] }
        )
      );
      if (count > 8)
        throw new ShopError("Too many pack requests. Wait a minute.", 429);
      const nonce = randomBytes(32);
      const prepared = await this.chain.prepare(buyer, nonce);
      const order: PackOrder = {
        ...prepared,
        id,
        createdAt: Date.now(),
        status: "prepared",
        signature: null,
        result: null,
        randomness: null,
      };
      await this.write({ playerId, nonce: nonce.toString("hex"), order });
      return order;
    });
  }
  get(playerId: string, id: string) {
    return this.lock(id, async () =>
      this.refresh((await this.read(id, playerId))!)
    );
  }
  submit(playerId: string, id: string, signed: unknown) {
    return this.lock(id, async () => {
      if (typeof signed !== "string")
        throw new ShopError("Purchase approval required");
      const s = (await this.read(id, playerId))!;
      const latest = await this.refresh(s);
      if (
        isTerminalPack(latest) ||
        latest.status === "waiting-result" ||
        latest.status === "ready-to-claim"
      )
        return latest;
      const signature = this.chain.validateSigned(latest, signed);
      if (latest.signature && latest.signature !== signature)
        throw new ShopError(
          "Another purchase approval is already pending",
          409
        );
      s.order = { ...latest, signature, status: "submitted" };
      s.signed = signed;
      await this.write(s);
      await this.chain.send(signed).catch(() => undefined);
      return this.refresh(s);
    });
  }
  private async refresh(s: Stored) {
    if (isTerminalPack(s.order)) return s.order;
    Object.assign(s.order, await this.chain.status(s.order));
    if (
      s.order.status === "waiting-result" ||
      s.order.status === "ready-to-claim" ||
      isTerminalPack(s.order)
    )
      delete s.signed;
    await this.write(s);
    if (s.order.status === "ready-to-claim") {
      // Durable claim bytes before broadcast. Regenerate only after final expiry;
      // program state + canonical asset PDA prevent double issuance/payment.
      if (
        !s.claim ||
        (await this.chain.height()) > s.claim.lastValidBlockHeight
      ) {
        s.claim = await this.chain.prepareClaim(s.order);
        await this.write(s);
      }
      await this.chain.send(s.claim.transaction).catch(() => undefined);
    } else if (s.signed) await this.chain.send(s.signed).catch(() => undefined);
    return s.order;
  }
  private async read(
    id: string,
    playerId: string,
    required = true
  ): Promise<Stored | null> {
    const value = await this.redis.get(`${this.prefix}:packs:order:${id}`);
    if (!value) {
      if (required) throw new ShopError("Pack purchase not found", 404);
      return null;
    }
    const s = JSON.parse(value) as Stored;
    if (s.playerId !== playerId)
      throw new ShopError("Pack purchase not found", 404);
    return s;
  }
  private async write(s: Stored) {
    // Paid entitlements have no TTL; terminal records retain a 90-day receipt.
    await this.redis.set(
      `${this.prefix}:packs:order:${s.order.id}`,
      JSON.stringify(s),
      isTerminalPack(s.order) ? { EX: 90 * 24 * 3600 } : undefined
    );
    await this.redis.eval(
      isTerminalPack(s.order)
        ? "return redis.call('ZREM',KEYS[1],ARGV[2])"
        : "return redis.call('ZADD',KEYS[1],ARGV[1],ARGV[2])",
      {
        keys: [`${this.prefix}:packs:pending`],
        arguments: [String(Date.now() + 15_000), s.order.id],
      }
    );
  }
  private async lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new ShopError("Pack purchase not found", 404);
    const key = `${this.prefix}:packs:lock:${id}`,
      token = randomUUID();
    if (!(await this.redis.set(key, token, { NX: true, EX: 120 })))
      throw new ShopError("Purchase is updating. Try again shortly.", 409);
    try {
      return await fn();
    } finally {
      await this.redis.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
        { keys: [key], arguments: [token] }
      );
    }
  }
}
