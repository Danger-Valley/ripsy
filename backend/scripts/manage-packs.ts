/** Prepare/simulate by default. --send is an explicit operator action. */
import { readFileSync } from "node:fs";
import { address, getProgramDerivedAddress } from "@solana/kit";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { fetchCollection } from "@metaplex-foundation/mpl-core";
import { FIGURES } from "@rps/core/shop";
import {
  INITIAL_PACK,
  PACK_PROGRAM_ID,
  PACK_PAYMENT,
  parsePackCatalog,
} from "@rps/core/packs";
import {
  addressBytes,
  decodeConfig,
  discriminator,
  publishEditionData,
} from "../src/pack-codec.js";
import { loadShopConfig } from "../src/shop-config.js";
import { verifyPackFigureResources } from "../src/pack-metadata.js";

const args = process.argv.slice(2);
const action = args.find((arg) =>
  ["initialize", "publish", "pause", "unpause"].includes(arg)
);
const adminPath = args.find((arg) => arg.startsWith("--admin="))?.slice(8);
if (!action || !adminPath)
  throw new Error(
    "Usage: manage-packs.ts initialize|publish|pause|unpause --admin=/absolute/keypair.json [--config=onchain/pack-config.json] [--send]"
  );
const config = loadShopConfig(process.env);
if (
  config.cluster !== "mainnet-beta" ||
  !config.collection ||
  !config.treasury ||
  !config.authoritySecret
)
  throw new Error("Use the configured mainnet store. No transaction was sent.");
const umi = createUmi(config.rpcUrl, { commitment: "confirmed" });
if (
  (await umi.rpc.call("getGenesisHash")) !==
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
)
  throw new Error("Wrong Solana network");
umi.use(
  keypairIdentity(
    umi.eddsa.createKeypairFromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(adminPath, "utf8")))
    )
  )
);
const mintAuthority = umi.eddsa.createKeypairFromSecretKey(
  Uint8Array.from(JSON.parse(config.authoritySecret))
).publicKey;
const collection = await fetchCollection(umi, publicKey(config.collection));
if (collection.updateAuthority !== mintAuthority)
  throw new Error("Mint authority is not the Core collection authority");
const utf = (v: string) => new TextEncoder().encode(v);
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
const key = (pubkey: string, isWritable = false, isSigner = false) => ({
  pubkey: publicKey(pubkey),
  isWritable,
  isSigner,
});
let data: Uint8Array;
let keys;
if (action === "initialize") {
  const programData = (
    await getProgramDerivedAddress({
      programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
      seeds: [addressBytes(address(PACK_PROGRAM_ID))],
    })
  )[0];
  data = Buffer.concat([
    discriminator("global", "initialize"),
    addressBytes(address(config.treasury)),
    addressBytes(address(config.collection)),
    addressBytes(address(mintAuthority)),
  ]);
  keys = [
    key(umi.identity.publicKey, true, true),
    key(root, true),
    key(PACK_PROGRAM_ID),
    key(programData),
    key("11111111111111111111111111111111"),
  ];
} else {
  const rootAccount = await umi.rpc.getAccount(root);
  if (!rootAccount.exists || rootAccount.owner !== publicKey(PACK_PROGRAM_ID))
    throw new Error("Initialize the deployed program first");
  const current = decodeConfig(rootAccount.data);
  if (String(current.admin) !== String(umi.identity.publicKey))
    throw new Error("Wrong pack admin");
  keys = [
    key(umi.identity.publicKey, action === "publish", true),
    key(root, true),
  ];
  if (action === "publish") {
    const file =
      args.find((arg) => arg.startsWith("--config="))?.slice(9) ??
      "onchain/pack-config.json";
    const edition = JSON.parse(readFileSync(file, "utf8"));
    const table = parsePackCatalog({
      ...INITIAL_PACK,
      version: edition.version,
      payment: { ...PACK_PAYMENT, amount: edition.priceBaseUnits },
      drops: edition.drops,
    });
    if (table.version !== current.version + 1)
      throw new Error(
        "Editions must be sequential. Existing editions cannot be edited."
      );
    // Edition URIs cannot be corrected in place. Validate live resources first.
    for (const drop of table.drops) {
      const figure = FIGURES.find(f => f.id === drop.figureId)!;
      await verifyPackFigureResources(config.publicOrigin, figure,
        readFileSync(`frontend/apps/web/public/figures/${figure.id}.png`));
    }
    const version = Buffer.alloc(4);
    version.writeUInt32LE(table.version);
    keys.push(
      key(await pda([utf("edition"), version]), true),
      key("11111111111111111111111111111111")
    );
    data = publishEditionData(
      table.version,
      BigInt(table.payment.amount),
      table.drops.map((d) => {
        const figure = FIGURES.find((f) => f.id === d.figureId)!;
        return {
          variant: figure.variant,
          weight: d.weight,
          name: figure.name,
          uri: `${config.publicOrigin}/figures/${figure.id}.json`,
        };
      })
    );
    console.log(
      JSON.stringify({
        version: table.version,
        priceBaseUnits: table.payment.amount,
        drops: table.drops,
      })
    );
  } else
    data = Buffer.concat([
      discriminator("global", "set_paused"),
      Buffer.from([action === "pause" ? 1 : 0]),
    ]);
}
const tx = transactionBuilder().add({
  instruction: { programId: publicKey(PACK_PROGRAM_ID), keys, data },
  signers: [umi.identity],
  bytesCreatedOnChain: 0,
});
if (!args.includes("--send")) {
  const prepared = await tx.buildAndSign(umi);
  const simulated = await umi.rpc.simulateTransaction(prepared, {
    verifySignatures: true,
  });
  if (simulated.err)
    throw new Error(
      `Pack admin simulation failed: ${JSON.stringify(simulated.err)}`
    );
  console.log(
    `${action} simulation passed. No transaction sent. Review before using --send.`
  );
} else {
  const result = await tx.sendAndConfirm(umi);
  console.log(
    `${action} confirmed. Transaction signature: ${
      base58.deserialize(result.signature)[0]
    }`
  );
}
