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
  type PackCatalog,
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
import { createHash } from 'node:crypto';
import { JUPITER, WSOL } from './shop-sol-funding.js';
import { SHOP_TOKEN_PROGRAM } from './shop-token-payment.js';
import { findAssociatedTokenPda, getMintAccountDataSerializer, getTokenAccountDataSerializer, TokenState } from '@metaplex-foundation/mpl-toolbox';

async function fixture(catalog: PackCatalog = INITIAL_PACK) {
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
  version.writeUInt32LE(catalog.version);
  const root = await pda([utf("config")]),
    edition = await pda([utf("edition"), version]);
  const [pricingKey, pricingBump] = await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID), seeds: [utf('price'), addressBytes(address(edition))] });
  let price: bigint | null = null;
  const rootData = Buffer.concat([
    discriminator("account", "Config"),
    ...[authority.publicKey, treasury, collection, authority.publicKey].map(
      (v) => addressBytes(address(v))
    ),
    version,
    Buffer.from([0, 255]),
  ]);
  const d = publishEditionData(
    catalog.version,
    BigInt(PACK_PAYMENT.amount),
    catalog.drops.map((drop) => {
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
  umi.rpc.getAccount = async (key) => {
    if (key === publicKey(PACK_PAYMENT.mint) || key === findAssociatedTokenPda(umi, { mint: publicKey(PACK_PAYMENT.mint), owner: buyer.publicKey })[0]) return {
      exists: true, publicKey: key, owner: SHOP_TOKEN_PROGRAM, lamports: lamports(2_039_280n), executable: false,
      data: key === publicKey(PACK_PAYMENT.mint)
        ? getMintAccountDataSerializer().serialize({ mintAuthority: null, supply: 10_000_000_000_000n, decimals: 6, isInitialized: true, freezeAuthority: null })
        : getTokenAccountDataSerializer().serialize({ mint: publicKey(PACK_PAYMENT.mint), owner: buyer.publicKey, amount: 10_000_000_000_000n, delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null }),
    };
    if (key === publicKey(pricingKey)) {
      if (price === null) return { exists: false, publicKey: key };
      const values = Buffer.alloc(17); values.writeBigUInt64LE(price); values.writeBigUInt64LE(1n, 8); values[16] = pricingBump;
      return { exists: true, publicKey: key, owner: publicKey(PACK_PROGRAM_ID), executable: false, lamports: lamports(1064880n), data: Buffer.concat([discriminator('account', 'EditionPrice'), values]) };
    }
    return (
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
      : { exists: false, publicKey: key });
  };
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
    config,
    buyer,
    authority,
    collection,
    treasury,
    chain,
    order,
    pricingKey, setPrice(value: bigint) { price = value; },
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

test('SOL-funded pack keeps the existing VRF buy and captured price/odds in one transaction', async () => {
  const f = await fixture(), oldFetch = globalThis.fetch, originalAccount = f.umi.rpc.getAccount;
  const source = findAssociatedTokenPda(f.umi, { mint: WSOL, owner: f.buyer.publicKey })[0];
  const output = findAssociatedTokenPda(f.umi, { mint: publicKey(PACK_PAYMENT.mint), owner: f.buyer.publicKey })[0];
  f.umi.rpc.getAccount = async key => [source, output].includes(key) ? { exists: false, publicKey: key } : originalAccount(key);
  f.umi.rpc.getAccounts = async keys => keys.map(key => ({ exists: false, publicKey: key }));
  globalThis.fetch = async url => {
    const input = BigInt(new URL(String(url)).searchParams.get('amount')!), data = Buffer.alloc(39);
    createHash('sha256').update('global:route_v2').digest().copy(data, 0, 0, 8);
    data.writeBigUInt64LE(input, 8); data.writeBigUInt64LE(input * 1000n, 16); data.writeUInt16LE(50, 24); data.writeUInt32LE(1, 30); data.writeUInt16LE(10000, 35); data[38] = 1;
    const accounts = [f.buyer.publicKey, source, output, WSOL, PACK_PAYMENT.mint, SHOP_TOKEN_PROGRAM, SHOP_TOKEN_PROGRAM, output].map((pubkey, i) => ({ pubkey, isSigner: i === 0, isWritable: i === 1 || i === 2 || i === 7 }));
    return new Response(JSON.stringify({ inputMint: WSOL, outputMint: PACK_PAYMENT.mint, inAmount: input.toString(), outAmount: (input * 1000n).toString(), otherAmountThreshold: (input * 995n).toString(), swapMode: 'ExactIn', slippageBps: 50, swapInstruction: { programId: JUPITER, accounts, data: data.toString('base64') } }));
  };
  f.umi.rpc.simulateTransaction = (async tx => {
    const ix = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === '11111111111111111111111111111111')!, input = Buffer.from(ix.data).readBigUInt64LE(4);
    const data = getTokenAccountDataSerializer().serialize({ mint: publicKey(PACK_PAYMENT.mint), owner: f.buyer.publicKey, amount: input * 995n - BigInt(PACK_PAYMENT.amount), delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null });
    return { err: null, logs: [], accounts: [{ lamports: Number(100000000n - input - 2000000n) }, { executable: false, owner: SHOP_TOKEN_PROGRAM, lamports: 2039280, data: [Buffer.from(data).toString('base64'), 'base64'] }, null] };
  }) as RpcInterface['simulateTransaction'];
  try {
    const chain = createPackChain({ ...f.config, jupiterApiKey: 'test-only-key' }, true, f.umi);
    const prepared = await chain.prepare(f.buyer.publicKey, new Uint8Array(32).fill(8), 'sol');
    const tx = f.umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
    const programs = tx.message.instructions.map(ix => tx.message.accounts[ix.programIndex]);
    assert.ok(programs.indexOf(JUPITER) < programs.indexOf(publicKey(PACK_PROGRAM_ID)));
    assert.equal(programs.filter(p => p === publicKey(PACK_PROGRAM_ID)).length, 1);
    assert.deepEqual(prepared.payment, PACK_PAYMENT); assert.deepEqual(prepared.drops, INITIAL_PACK.drops);
    assert.equal(prepared.networkFeeLamports, '2000000'); assert.ok(prepared.solFunding);
    assert.equal(tx.signatures[0]!.every(byte => byte === 0), true);
  } finally { globalThis.fetch = oldFetch; }
});
test('mutable price affects new purchases only; paid receipt status and claim retain the exact old payment and odds', async () => {
  const f = await fixture(); const original = structuredClone(f.order);
  f.setPrice(10_000_000n);
  assert.equal((await f.chain.catalog()).payment.amount, '10000000');
  assert.equal((await f.chain.catalog()).version, original.version);
  const fresh = await f.chain.prepare(f.buyer.publicKey, new Uint8Array(32).fill(9));
  assert.equal(fresh.payment.amount, '10000000');
  assert.deepEqual(fresh.drops, original.drops);
  f.setReceipt(1, 1);
  assert.equal((await f.chain.status(original)).result, 'bonk');
  await f.chain.prepareClaim(original);
  f.setPrice(1_000_000n); f.setReceipt(2, 1);
  assert.equal((await f.chain.status(original)).status, 'confirmed');
  assert.deepEqual(f.order, original);
});
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
  assert.equal(tx.message.accounts[ix.accountIndexes[14]!], f.pricingKey);
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
test('edition 2 maps the verified ORE result and fixes its claim recipient without changing old receipts', async () => {
  const catalog: PackCatalog = { ...INITIAL_PACK, version: 2, drops: [
    { figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 },
  ] };
  const f = await fixture(catalog);
  assert.equal(f.order.version, 2);
  assert.deepEqual((await f.chain.catalog()).drops, catalog.drops);
  f.setReceipt(1, 2);
  assert.equal((await f.chain.status(f.order)).result, 'ore');
  parsePackOrder({ ...f.order, ...(await f.chain.status(f.order)) });
  const claim = await f.chain.prepareClaim(f.order);
  const tx = f.umi.transactions.deserialize(Buffer.from(claim.transaction, 'base64'));
  const ix = tx.message.instructions.at(-1)!;
  assert.equal(tx.message.accounts[ix.accountIndexes[3]!], f.buyer.publicKey);
  assert.equal(tx.message.accounts[ix.accountIndexes[6]!], f.order.asset);
  const old = await fixture();
  old.setReceipt(1, 1);
  assert.equal((await old.chain.status(old.order)).result, 'bonk');
  assert.equal(old.order.version, 1);
  assert.deepEqual(old.order.drops, INITIAL_PACK.drops);
});
