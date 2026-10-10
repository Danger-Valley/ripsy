/** Only localhost, no .env, no real funds. Checks the actual SBF binary ABI. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { address, getProgramDerivedAddress } from "@solana/kit";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { INITIAL_PACK, PACK_PAYMENT, PACK_PROGRAM_ID } from "@rps/core/packs";
import { FIGURES } from "@rps/core/shop";
import {
  addressBytes,
  decodeConfig,
  decodeEdition,
  discriminator,
  publishEditionData,
  editionPriceData,
  decodeEditionPrice,
} from "../../backend/src/pack-codec.js";
const port =
  process.argv.find((arg) => arg.startsWith("--port="))?.slice(7) ?? "19999";
if (!/^\d{4,5}$/.test(port) || Number(port) > 65535)
  throw new Error("Invalid local test port");
const umi = createUmi(`http://127.0.0.1:${port}`, { commitment: "confirmed" });
umi.use(
  keypairIdentity(
    umi.eddsa.createKeypairFromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(process.argv[2]!, "utf8")))
    )
  )
);
async function checkPricing() {
  const before = await umi.rpc.getAccount(edition); assert.ok(before.exists);
  const [priceKey, priceBump] = await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID), seeds: [utf('price'), addressBytes(address(edition))] });
  const priceAccounts = [key(umi.identity.publicKey, true, true), key(root), key(edition), key(priceKey, true)];
  await send(editionPriceData(1, 0n, BigInt(PACK_PAYMENT.amount), 10_000_000n), [...priceAccounts, key('11111111111111111111111111111111')]);
  const price = await umi.rpc.getAccount(publicKey(priceKey)); assert.ok(price.exists); assert.equal(price.data.length, 25);
  assert.deepEqual(decodeEditionPrice(price.data), { price: 10_000_000n, revision: 1n, bump: priceBump });
  await assert.rejects(() => send(editionPriceData(1, 0n, BigInt(PACK_PAYMENT.amount), 10_000_000n), [...priceAccounts, key('11111111111111111111111111111111')]));
  await assert.rejects(() => send(editionPriceData(1, 2n, 10_000_000n, 12_000_000n), priceAccounts), /StaleQuote|0x1773/);
  await assert.rejects(() => send(editionPriceData(1, 1n, 9_000_000n, 12_000_000n), priceAccounts), /StaleQuote|0x1773/);
  await assert.rejects(() => send(editionPriceData(1, 1n, 10_000_000n, 0n), priceAccounts), /StaleQuote|0x1773/);
  await send(editionPriceData(1, 1n, 10_000_000n, 12_000_000n), priceAccounts);
  const updated = await umi.rpc.getAccount(publicKey(priceKey)); assert.ok(updated.exists);
  assert.equal(decodeEditionPrice(updated.data).revision, 2n);
  assert.equal(decodeEditionPrice(updated.data).price, 12_000_000n);
  const after = await umi.rpc.getAccount(edition); assert.ok(after.exists); assert.deepEqual(after.data, before.data);
  const oldReceipt = await umi.rpc.getAccount(receipt); assert.ok(oldReceipt.exists);
  const paid = Buffer.from(oldReceipt.data); assert.equal(paid.readBigUInt64LE(168), BigInt(PACK_PAYMENT.amount));
  const v2 = Buffer.alloc(4); v2.writeUInt32LE(2); const edition2 = await pda([utf('edition'), v2]);
  const d2 = drops.map(d => ({ ...d, weight: 400000 })); d2.push({ variant: 5, weight: 200000, name: 'ORE', uri: 'https://www.ripsy.fun/figures/ore.json' });
  await send(publishEditionData(2, 12_000_000n, d2), [key(umi.identity.publicKey, true, true), key(root, true), key(edition2, true), key('11111111111111111111111111111111')]);
  const compact = await umi.rpc.getAccount(edition2); assert.ok(compact.exists); assert.equal(compact.data.length, 285);
  assert.equal(decodeEdition(compact.data).price, 12_000_000n);
  await assert.rejects(() => send(editionPriceData(1, 2n, 12_000_000n, 13_000_000n), priceAccounts), /StaleQuote|0x1773/);
  console.log('Local upgrade pricing passed: old edition/receipt untouched; 25-byte price PDA, CAS/replay/zero/stale-edition rejection, 285-byte three-drop edition. No mainnet transactions.');
}
const utf = (s: string) => new TextEncoder().encode(s);
const pda = async (seeds: Uint8Array[]) =>
  publicKey(
    (
      await getProgramDerivedAddress({
        programAddress: address(PACK_PROGRAM_ID),
        seeds,
      })
    )[0]
  );
const root = await pda([utf("config")]);
const programData = publicKey(
  (
    await getProgramDerivedAddress({
      programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
      seeds: [addressBytes(address(PACK_PROGRAM_ID))],
    })
  )[0]
);
const key = (pubkey: string, isWritable = false, isSigner = false) => ({
  pubkey: publicKey(pubkey),
  isWritable,
  isSigner,
});
const send = (data: Uint8Array, keys: ReturnType<typeof key>[]) =>
  transactionBuilder()
    .add({
      instruction: { programId: publicKey(PACK_PROGRAM_ID), data, keys },
      signers: [umi.identity],
      bytesCreatedOnChain: 0,
    })
    .sendAndConfirm(umi);
if (!process.argv.includes("--resume"))
  await send(
    Buffer.concat([
      discriminator("global", "initialize"),
      ...Array(3).fill(addressBytes(address(umi.identity.publicKey))),
    ]),
    [
      key(umi.identity.publicKey, true, true),
      key(root, true),
      key(PACK_PROGRAM_ID),
      key(programData),
      key("11111111111111111111111111111111"),
    ]
  );
let account = await umi.rpc.getAccount(root);
assert.ok(account.exists);
assert.equal(decodeConfig(account.data).paused, true);
const version = Buffer.alloc(4);
version.writeUInt32LE(1);
const edition = await pda([utf("edition"), version]);
const drops = INITIAL_PACK.drops.map((d) => {
  const f = FIGURES.find((f) => f.id === d.figureId)!;
  return {
    variant: f.variant,
    weight: d.weight,
    name: f.name,
    uri: `https://www.ripsy.fun/figures/${f.id}.json`,
  };
});
const accounts = [
  key(umi.identity.publicKey, true, true),
  key(root, true),
  key(edition, true),
  key("11111111111111111111111111111111"),
];
if (!process.argv.includes("--resume"))
  await send(
    publishEditionData(1, BigInt(PACK_PAYMENT.amount), drops),
    accounts
  );
account = await umi.rpc.getAccount(edition);
assert.ok(account.exists);
assert.deepEqual(
  decodeEdition(account.data).drops.map((d) => [d.variant, d.weight]),
  [
    [4, 500000],
    [3, 500000],
  ]
);
await assert.rejects(() =>
  send(publishEditionData(1, BigInt(PACK_PAYMENT.amount), drops), accounts)
);
await send(
  Buffer.concat([discriminator("global", "set_paused"), Buffer.from([0])]),
  [key(umi.identity.publicKey, false, true), key(root, true)]
);
account = await umi.rpc.getAccount(root);
assert.ok(account.exists);
assert.equal(decodeConfig(account.data).paused, false);
await send(
  Buffer.concat([discriminator("global", "set_paused"), Buffer.from([1])]),
  [key(umi.identity.publicKey, false, true), key(root, true)]
);
// A transaction signed by an ordinary wallet cannot impersonate the scoped VRF.
const receipt = await pda([
  utf("pack"),
  addressBytes(address(umi.identity.publicKey)),
  new Uint8Array(32).fill(7),
]);
await assert.rejects(
  () =>
    send(
      Buffer.concat([
        discriminator("global", "resolve_pack"),
        Buffer.alloc(64),
      ]),
      [
        key(umi.identity.publicKey, false, true),
        key(receipt, true),
        key(edition),
      ]
    ),
  /ConstraintAddress|0x7dc/
);
console.log(
  "Local SBF smoke passed: upgrade-authority initialization, immutable 50/50 edition, pause/unpause, rejection of forged VRF caller. No mainnet transactions."
);
if (process.argv.includes('--pricing')) await checkPricing();
