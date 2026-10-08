import test from "node:test";
import assert from "node:assert/strict";
import { address, getProgramDerivedAddress } from "@solana/kit";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  lamports,
  publicKey,
  type RpcInterface,
} from "@metaplex-foundation/umi";
import {
  PACK_PAYMENT,
  PACK_PROGRAM_ID,
  INITIAL_PACK,
  parsePackOrder,
  type PackOrder,
} from "@rps/core/packs";
import { FIGURES } from "@rps/core/shop";
import {
  addressBytes,
  discriminator,
  publishEditionData,
} from "./pack-codec.js";
import { createPackChain } from "./pack-chain.js";
import { loadShopConfig } from "./shop-config.js";

async function fixture() {
  const umi = createUmi("http://127.0.0.1:8899");
  const authority = generateSigner(umi),
    buyer = generateSigner(umi),
    collection = generateSigner(umi).publicKey,
    treasury = generateSigner(umi).publicKey;
  const config = {
    ...loadShopConfig({}),
    enabled: true,
    cluster: "mainnet-beta" as const,
    authoritySecret: JSON.stringify([...authority.secretKey]),
    collection,
    treasury,
  };
  const utf = (s: string) => new TextEncoder().encode(s);
  const pda = async (seeds: Uint8Array[]) =>
    (
      await getProgramDerivedAddress({
        programAddress: address(PACK_PROGRAM_ID),
        seeds,
      })
    )[0];
  const version = Buffer.alloc(4);
  version.writeUInt32LE(1);
  const root = await pda([utf("config")]),
    edition = await pda([utf("edition"), version]);
  const rootData = Buffer.concat([
    discriminator("account", "Config"),
    ...[authority.publicKey, treasury, collection, authority.publicKey].map(
      (v) => addressBytes(address(v))
    ),
    version,
    Buffer.from([0, 255]),
  ]);
  const d = publishEditionData(
    1,
    BigInt(PACK_PAYMENT.amount),
    INITIAL_PACK.drops.map((drop) => {
      const f = FIGURES.find((f) => f.id === drop.figureId)!;
      return {
        variant: f.variant,
        weight: drop.weight,
        name: f.name,
        uri: `${config.publicOrigin}/figures/${f.id}.json`,
      };
    })
  );
  const editionData = Buffer.concat([
    discriminator("account", "Edition"),
    d.subarray(8, 20),
    ...[treasury, collection, authority.publicKey].map((v) =>
      addressBytes(address(v))
    ),
    d.subarray(20),
    Buffer.from([255]),
  ]);
  let receiptData: Uint8Array | null = null;
  umi.rpc.getAccount = async (key) =>
    key === publicKey(PACK_PROGRAM_ID) ||
    key === publicKey(root) ||
    key === publicKey(edition) ||
    receiptData
      ? {
          exists: true,
          publicKey: key,
          owner: publicKey(PACK_PROGRAM_ID),
          lamports: lamports(10000000n),
          executable: key === publicKey(PACK_PROGRAM_ID),
          data:
            key === publicKey(root)
              ? rootData
              : key === publicKey(edition)
              ? editionData
              : receiptData ?? new Uint8Array(),
        }
      : { exists: false, publicKey: key };
  umi.rpc.getLatestBlockhash = async () => ({
    blockhash: publicKey("11111111111111111111111111111111"),
    lastValidBlockHeight: 100,
  });
  umi.rpc.getBalance = async () => lamports(100000000n);
  umi.rpc.call = (async (method) =>
    method === "getGenesisHash"
      ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
      : method === "getBlockHeight"
      ? 101
      : []) as RpcInterface["call"];
  umi.rpc.simulateTransaction = (async () => ({
    err: null,
    logs: [],
    accounts: [{ lamports: 98000000 }],
  })) as unknown as RpcInterface["simulateTransaction"];
  const chain = createPackChain(config, true, umi);
  const nonce = new Uint8Array(32).fill(7);
  const p = await chain.prepare(buyer.publicKey, nonce);
  const order: PackOrder = {
    ...p,
    id: "a".repeat(64),
    status: "prepared",
    signature: null,
    result: null,
    randomness: null,
    createdAt: 1,
  };
  return {
    umi,
    buyer,
    authority,
    collection,
    treasury,
    chain,
    order,
    setReceipt(state: number, index = 0) {
      const price = Buffer.alloc(8);
      price.writeBigUInt64LE(BigInt(PACK_PAYMENT.amount));
      receiptData = Buffer.concat([
        discriminator("account", "Receipt"),
        addressBytes(address(buyer.publicKey)),
        addressBytes(address(edition)),
        nonce,
        Buffer.alloc(32),
        Buffer.alloc(32, 5),
        price,
        Buffer.from([state, index, 255]),
      ]);
    },
  };
}
test("pack purchase wire has a single buyer signer, pinned SKR/VRF and exact price; no Seeker accounts", async () => {
  const f = await fixture();
  parsePackOrder(f.order);
  const tx = f.umi.transactions.deserialize(
    Buffer.from(f.order.transaction, "base64")
  );
  assert.equal(tx.message.header.numRequiredSignatures, 1);
  assert.equal(tx.message.accounts[0], f.buyer.publicKey);
  const ix = tx.message.instructions[1]!;
  assert.equal(tx.message.accounts[ix.programIndex], PACK_PROGRAM_ID);
  assert.equal(Buffer.from(ix.data).readBigUInt64LE(44), 1099000000n);
  assert.equal(tx.message.accounts[ix.accountIndexes[4]!], PACK_PAYMENT.mint);
  assert.equal(
    tx.message.accounts[ix.accountIndexes[10]!],
    "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
  );
  assert.equal(f.order.networkFeeLamports, "2000000");
  const signed = await f.buyer.signTransaction(tx);
  const encoded = Buffer.from(f.umi.transactions.serialize(signed)).toString(
    "base64"
  );
  assert.ok(f.chain.validateSigned(f.order, encoded));
  assert.throws(
    () => f.chain.validateSigned(f.order, f.order.transaction),
    /signature/
  );
});
test("paid receipt cannot expire on an inconsistent RPC read; pre-payment expiry needs full history", async () => {
  const f = await fixture();
  await assert.rejects(
    () => f.chain.status({ ...f.order, status: "waiting-result" }),
    /reconciliation/
  );
  assert.equal((await f.chain.status(f.order)).status, "expired");
  f.umi.rpc.call = (async (method) =>
    method === "getBlockHeight"
      ? 101
      : [{ signature: "1".repeat(64) }]) as RpcInterface["call"];
  f.umi.rpc.getTransaction = async () => null;
  await assert.rejects(() => f.chain.status(f.order), /reconciliation/);
});
test("onchain receipt determines one result; claim fixes destination, collection, asset and backend payer", async () => {
  const f = await fixture();
  f.setReceipt(1, 1);
  assert.equal((await f.chain.status(f.order)).result, "bonk");
  const claim = await f.chain.prepareClaim(f.order);
  const tx = f.umi.transactions.deserialize(
    Buffer.from(claim.transaction, "base64")
  );
  assert.equal(tx.message.accounts[0], f.authority.publicKey);
  const ix = tx.message.instructions.at(-1)!;
  const keys = ix.accountIndexes.map((i) => tx.message.accounts[i]);
  assert.equal(keys[3], f.buyer.publicKey);
  assert.equal(keys[4], f.authority.publicKey);
  assert.equal(keys[5], f.collection);
  assert.equal(keys[6], f.order.asset);
  assert.deepEqual([...ix.data], [...discriminator("global", "claim_pack")]);
  f.setReceipt(2, 1);
  assert.equal((await f.chain.status(f.order)).status, "confirmed");
});
test("wrong-owner receipt and purchase simulation failure stay fail-closed", async () => {
  const f = await fixture();
  f.umi.rpc.getAccount = async (key) => ({
    exists: true,
    publicKey: key,
    owner: publicKey("11111111111111111111111111111111"),
    lamports: lamports(0n),
    executable: false,
    data: new Uint8Array(),
  });
  await assert.rejects(() => f.chain.status(f.order), /owner/);
  const g = await fixture();
  g.umi.rpc.simulateTransaction = (async () => ({
    err: "InsufficientFunds",
    logs: [],
  })) as unknown as RpcInterface["simulateTransaction"];
  await assert.rejects(
    () => g.chain.prepare(g.buyer.publicKey, new Uint8Array(32)),
    /No payment was sent/
  );
});
