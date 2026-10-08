import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_PACK,
  PACK_PAYMENT,
  PACK_PROGRAM_ID,
  packPrice,
  parsePackCatalog,
  parsePackOrder,
  type PackOrder,
} from "@rps/core/packs";
import { buyPackData, decodeReceipt, discriminator } from "./pack-codec.js";
import { PackService } from "./pack-service.js";
import { createPackChain, type PackChain } from "./pack-chain.js";
import { loadShopConfig } from "./shop-config.js";
import type { ShopRedis } from "./shop-service.js";

const buyer = "11111111111111111111111111111111";
const prepared: PackOrder = {
  id: "a".repeat(64),
  buyer,
  asset: buyer,
  receipt: buyer,
  edition: buyer,
  cluster: "mainnet-beta",
  transaction: "AQ==",
  version: 1,
  payment: PACK_PAYMENT,
  drops: INITIAL_PACK.drops,
  status: "prepared",
  signature: null,
  result: null,
  randomness: null,
  networkFeeLamports: "1000",
  lastValidBlockHeight: 100,
  createdAt: 1,
};
class MemoryRedis implements ShopRedis {
  data = new Map<string, string>();
  due = new Map<string, number>();
  options = new Map<string, unknown>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number }
  ) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value);
    this.options.set(key, options);
    return "OK";
  }
  async eval(script: string, o: { keys: string[]; arguments: string[] }) {
    const key = o.keys[0]!;
    if (script.includes("INCR")) {
      const n = Number(this.data.get(key) ?? 0) + 1;
      this.data.set(key, String(n));
      return n;
    }
    if (script.includes("ZRANGEBYSCORE"))
      return [...this.due]
        .filter(([, time]) => time <= Number(o.arguments[0]))
        .slice(0, 5)
        .map(([id]) => id);
    if (script.includes("ZADD")) {
      this.due.set(o.arguments[1]!, Number(o.arguments[0]));
      return 1;
    }
    if (script.includes("ZREM")) {
      this.due.delete(o.arguments[script.includes("ARGV[2]") ? 1 : 0]!);
      return 1;
    }
    if (this.data.get(key) === o.arguments[0]) this.data.delete(key);
    return 1;
  }
}
test('real disabled chain rejects before persisting an order or preparing payment', async () => {
  const redis = new MemoryRedis();
  const chain = createPackChain(loadShopConfig({}), false);
  const service = new PackService(redis, chain);
  assert.equal((await service.catalog()).available, false);
  await assert.rejects(service.create('diagnostic', {
    buyer, idempotencyKey: 'disabled-purchase-test-1234',
  }), error => error instanceof Error && error.message === 'Packs are not available yet.' &&
    (error as Error & { status: number }).status === 503);
  assert.equal([...redis.data.keys()].some(key => key.includes(':order:')), false);
  assert.equal([...redis.data.keys()].some(key => key.includes(':lock:')), false);
  assert.equal(redis.due.size, 0);
});
function fixture() {
  const redis = new MemoryRedis();
  let prepares = 0,
    claims = 0;
  const sent: string[] = [];
  let state: PackOrder["status"] = "prepared";
  const chain: PackChain = {
    async catalog() {
      return INITIAL_PACK;
    },
    async prepare() {
      prepares++;
      return prepared;
    },
    validateSigned(_order, signed) {
      if (signed !== "signed") throw new Error("Bad signature");
      return "1".repeat(64);
    },
    async send(signed) {
      sent.push(signed);
    },
    async status(o) {
      return {
        ...o,
        status: state,
        result:
          state === "ready-to-claim" || state === "confirmed" ? "jup" : null,
        randomness:
          state === "ready-to-claim" || state === "confirmed"
            ? "f".repeat(64)
            : null,
      };
    },
    async prepareClaim() {
      claims++;
      return { transaction: "claim-signed", lastValidBlockHeight: 200 };
    },
    async height() {
      return 110;
    },
  };
  const service = new PackService(redis, chain),
    replica = new PackService(redis, chain);
  return {
    redis,
    chain,
    service,
    replica,
    sent,
    prepares: () => prepares,
    claims: () => claims,
    setState: (s: typeof state) => {
      state = s;
    },
  };
}
const input = { buyer, idempotencyKey: "pack-purchase-request-12345" };
test('ORE edition has Jup/BONK/ORE 40/40/20 at the unchanged SKR price; old orders remain pinned', () => {
  const config = JSON.parse(readFileSync(new URL('../../onchain/pack-config.json', import.meta.url), 'utf8'));
  const catalog = parsePackCatalog({ ...INITIAL_PACK, version: config.version,
    payment: { ...PACK_PAYMENT, amount: config.priceBaseUnits }, drops: config.drops });
  assert.equal(catalog.version, 2);
  assert.equal(packPrice(catalog.payment), '1,099 SKR');
  assert.deepEqual(catalog.drops, [
    { figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 },
  ]);
  assert.equal(parsePackOrder({ ...prepared, version: 2, drops: catalog.drops, status: 'confirmed', result: 'ore', randomness: 'f'.repeat(64) }).result, 'ore');
  assert.deepEqual(parsePackOrder(prepared).drops, INITIAL_PACK.drops);
  assert.throws(() => parsePackOrder({ ...prepared, status: 'confirmed', result: 'ore', randomness: 'f'.repeat(64) }));
});
test("confirmed initial pack is 1,099 SKR, Jup/BONK 50/50, no Seeker or free figure", () => {
  assert.equal(packPrice(PACK_PAYMENT), "1,099 SKR");
  assert.deepEqual(INITIAL_PACK.drops, [
    { figureId: "jup", weight: 500000 },
    { figureId: "bonk", weight: 500000 },
  ]);
  assert.equal(parsePackCatalog(INITIAL_PACK).available, false);
  for (const drops of [
    [{ figureId: "fig2", weight: 1000000 }],
    [{ figureId: "fig1", weight: 1000000 }],
    [
      { figureId: "jup", weight: 1000000 },
      { figureId: "jup", weight: 1 },
    ],
    [{ figureId: "bonk", weight: 999999 }],
  ])
    assert.throws(() => parsePackCatalog({ ...INITIAL_PACK, drops }));
  assert.equal(
    parsePackCatalog({
      ...INITIAL_PACK,
      version: 2,
      drops: [
        { figureId: "jup", weight: 250000 },
        { figureId: "bonk", weight: 750000 },
      ],
    }).version,
    2
  );
});
test("Anchor generated IDL matches program, instructions and classic SKR account ABI", () => {
  const idl = JSON.parse(
    readFileSync(
      new URL("../../onchain/idl/ripsy_packs.json", import.meta.url),
      "utf8"
    )
  );
  assert.equal(idl.address, PACK_PROGRAM_ID);
  for (const ix of idl.instructions)
    assert.deepEqual([...discriminator("global", ix.name)], ix.discriminator);
  for (const account of idl.accounts)
    assert.deepEqual(
      [...discriminator("account", account.name)],
      account.discriminator
    );
  const buy = idl.instructions.find(
    (ix: { name: string }) => ix.name === "buy_pack"
  );
  assert.deepEqual(
    buy.accounts.map((a: { name: string }) => a.name),
    [
      "buyer",
      "config",
      "edition",
      "receipt",
      "skr_mint",
      "buyer_tokens",
      "escrow",
      "program_identity",
      "oracle_queue",
      "slot_hashes",
      "vrf_program",
      "token_program",
      "associated_token_program",
      "system_program",
    ]
  );
  assert.equal(buy.accounts[4].address, PACK_PAYMENT.mint);
  const data = Buffer.from(
    buyPackData(new Uint8Array(32).fill(7), 1, PACK_PAYMENT.amount)
  );
  assert.equal(data.readBigUInt64LE(44), 1099000000n);
  const bytes = Buffer.alloc(187);
  bytes.set(discriminator("account", "Receipt"));
  bytes.writeBigUInt64LE(1099000000n, 168);
  bytes[176] = 1;
  bytes[177] = 1;
  bytes[178] = 250;
  assert.equal(decodeReceipt(bytes).price, 1099000000n);
  assert.equal(decodeReceipt(bytes).state, 1);
  assert.equal(decodeReceipt(bytes).dropIndex, 1);
  assert.throws(
    () => decodeReceipt(new Uint8Array(200)),
    /Invalid pack account/
  );
});
test("client accepts only truthful resolved results and exact SKR orders", () => {
  assert.equal(parsePackOrder(prepared).status, "prepared");
  assert.throws(() => parsePackOrder({ ...prepared, status: "confirmed" }));
  assert.throws(() =>
    parsePackOrder({ ...prepared, status: "waiting-result", result: "jup" })
  );
  assert.throws(() =>
    parsePackOrder({ ...prepared, payment: { ...PACK_PAYMENT, mint: buyer } })
  );
  assert.throws(() =>
    parsePackOrder({
      ...prepared,
      status: "ready-to-claim",
      result: "fig2",
      randomness: "f".repeat(64),
    })
  );
});
test("pack needs no Seeker proof and ignores caller prices and chances; replicas deduplicate", async () => {
  const f = fixture();
  const first = await f.service.create("player", {
    ...input,
    payment: { amount: "1" },
    drops: [{ figureId: "fig2", weight: 1000000 }],
  });
  const repeated = await f.replica.create("player", input);
  assert.deepEqual(first, repeated);
  assert.equal(f.prepares(), 1);
  assert.deepEqual(first.payment, PACK_PAYMENT);
  await assert.rejects(() => f.replica.get("other", first.id), /not found/);
  await assert.rejects(
    () =>
      f.replica.create("player", {
        ...input,
        buyer: "So11111111111111111111111111111111111111112",
      }),
    /already used/
  );
});
test("invalid approval never broadcasts; signed payment is persisted before uncertain delivery", async () => {
  const f = fixture();
  const order = await f.service.create("player", input);
  await assert.rejects(
    () => f.service.submit("player", order.id, "tampered"),
    /signature/
  );
  assert.equal(f.sent.length, 0);
  f.setState("submitted");
  f.chain.send = async () => {
    const s = JSON.parse((await f.redis.get(`ripsy:packs:order:${order.id}`))!);
    assert.equal(s.signed, "signed");
    throw new Error("Lost response");
  };
  assert.equal(
    (await f.service.submit("player", order.id, "signed")).status,
    "submitted"
  );
  assert.equal(f.prepares(), 1);
});
test("claim is persisted before send, reused by another replica, and preserves chosen fighter", async () => {
  const f = fixture();
  const order = await f.service.create("player", input);
  f.setState("ready-to-claim");
  f.chain.send = async (tx) => {
    assert.equal(
      JSON.parse((await f.redis.get(`ripsy:packs:order:${order.id}`))!).claim
        .transaction,
      tx
    );
  };
  assert.equal((await f.service.get("player", order.id)).result, "jup");
  await f.replica.get("player", order.id);
  assert.equal(f.claims(), 1);
  assert.equal(f.redis.options.get(`ripsy:packs:order:${order.id}`), undefined);
  f.setState("confirmed");
  assert.equal((await f.replica.get("player", order.id)).status, "confirmed");
  assert.equal(f.redis.due.size, 0);
  await f.service.submit("player", order.id, "signed");
  assert.equal(f.claims(), 1);
  assert.equal(f.prepares(), 1);
});
test("background recovery issues the saved result even with no app polling", async () => {
  const f = fixture();
  const order = await f.service.create("player", input);
  f.setState("ready-to-claim");
  f.redis.due.set(order.id, 0);
  await f.replica.recoverDue((error) => {
    throw error;
  });
  assert.equal(f.claims(), 1);
  assert.deepEqual(f.sent, ["claim-signed"]);
});
