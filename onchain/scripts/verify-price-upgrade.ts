/** Read-only mainnet capability check. No private keys/signing/sending. */
import assert from "node:assert/strict";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNoopSigner,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { address, getProgramDerivedAddress } from "@solana/kit";
import {
  decodeConfig,
  decodeEdition,
  decodeEditionPrice,
  editionPriceData,
  addressBytes,
} from "../../backend/src/pack-codec.js";
const program = "43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ";
const admin = "BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh";
async function main() {
  const url = process.env.SHOP_SOLANA_RPC_URL;
  assert.ok(url && new URL(url).protocol === "https:");
  const umi = createUmi(url, { commitment: "finalized" });
  assert.equal(
    await umi.rpc.getGenesisHash(),
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  );
  const pda = async (seeds: Uint8Array[]) =>
    publicKey(
      (
        await getProgramDerivedAddress({
          programAddress: address(program),
          seeds,
        })
      )[0]
    );
  const root = await pda([new TextEncoder().encode("config")]);
  const c = await umi.rpc.getAccount(root);
  assert.ok(c.exists && c.owner === program);
  const config = decodeConfig(c.data);
  assert.equal(config.admin, admin);
  assert.equal(config.version, 2);
  assert.equal(config.paused, false);
  const version = Buffer.alloc(4);
  version.writeUInt32LE(config.version);
  const editionKey = await pda([new TextEncoder().encode("edition"), version]);
  const e = await umi.rpc.getAccount(editionKey);
  assert.ok(e.exists && e.owner === program);
  const edition = decodeEdition(e.data);
  assert.equal(edition.price, 1099000000n);
  assert.deepEqual(
    edition.drops.map((d) => [d.variant, d.weight]),
    [
      [4, 400000],
      [3, 400000],
      [5, 200000],
    ]
  );
  const priceKey = await pda([
    new TextEncoder().encode("price"),
    addressBytes(address(editionKey)),
  ]);
  const before = await umi.rpc.getAccount(priceKey);
  assert.equal(before.exists, false);
  const signer = createNoopSigner(publicKey(admin));
  const meta = (pubkey: string, isWritable = false, isSigner = false) => ({
    pubkey: publicKey(pubkey),
    isWritable,
    isSigner,
  });
  // A hypothetical one-base-unit increase proves the new ABI; never broadcast.
  const tx = await transactionBuilder()
    .setVersion(0)
    .setFeePayer(signer)
    .setBlockhash(await umi.rpc.getLatestBlockhash({ commitment: "finalized" }))
    .add({
      instruction: {
        programId: publicKey(program),
        data: editionPriceData(
          config.version,
          0n,
          edition.price,
          edition.price + 1n
        ),
        keys: [
          meta(admin, true, true),
          meta(root),
          meta(editionKey),
          meta(priceKey, true),
          meta("11111111111111111111111111111111"),
        ],
      },
      signers: [signer],
      bytesCreatedOnChain: 0,
    })
    .buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(tx, {
    verifySignatures: false,
    accounts: [priceKey],
  });
  assert.equal(simulation.err, null);
  const created = simulation.accounts?.[0];
  assert.ok(created);
  const data = Buffer.from(created.data[0]!, "base64");
  assert.equal(data.length, 25);
  assert.equal(decodeEditionPrice(data).price, edition.price + 1n);
  assert.equal(decodeEditionPrice(data).revision, 1n);
  const after = await umi.rpc.getAccount(priceKey);
  assert.equal(after.exists, false);
  const unchanged = await umi.rpc.getAccount(editionKey);
  assert.ok(unchanged.exists);
  assert.deepEqual(unchanged.data, e.data);
  console.log(
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      mainnetPriceInstructionSimulationPassed: true,
      priceAccountBytes: data.length,
      firstPriceAccountRentLamports: created.lamports,
      mainnetTransactionSent: false,
      existingEditionBytesUnchanged: true,
      activeEdition: config.version,
      currentPriceBaseUnits: edition.price.toString(),
      currentWeights: edition.drops.map((d) => [d.name, d.weight]),
      priceAccountExistsOnChain: false,
    })
  );
}
main().catch(() => {
  console.error(
    "Read-only price capability check failed; sensitive diagnostics suppressed."
  );
  process.exitCode = 1;
});
