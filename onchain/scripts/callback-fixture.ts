/** Generate a local genesis receipt to test scoped callback authorization. */
import { writeFileSync } from "node:fs";
import { address, getProgramDerivedAddress } from "@solana/kit";
import { PACK_PAYMENT, PACK_PROGRAM_ID } from "@rps/core/packs";
import { addressBytes, discriminator } from "../../backend/src/pack-codec.js";
const buyer = address(process.argv[2]!);
const output = process.argv[3]!;
if (!/^\/private\/tmp\/ripsy-packs-[^/]+\/receipt\.json$/.test(output))
  throw new Error("Use a fresh ripsy-packs temporary directory");
const nonce = new Uint8Array(32).fill(7);
const version = Buffer.alloc(4);
version.writeUInt32LE(1);
const edition = (
  await getProgramDerivedAddress({
    programAddress: address(PACK_PROGRAM_ID),
    seeds: [new TextEncoder().encode("edition"), version],
  })
)[0];
const [receipt, bump] = await getProgramDerivedAddress({
  programAddress: address(PACK_PROGRAM_ID),
  seeds: [new TextEncoder().encode("pack"), addressBytes(buyer), nonce],
});
const price = Buffer.alloc(8);
price.writeBigUInt64LE(BigInt(PACK_PAYMENT.amount));
const data = Buffer.concat([
  discriminator("account", "Receipt"),
  addressBytes(buyer),
  addressBytes(edition),
  nonce,
  Buffer.alloc(64),
  price,
  Buffer.from([0, 0, bump]),
]);
writeFileSync(
  output,
  JSON.stringify({
    pubkey: receipt,
    account: {
      lamports: 5_000_000,
      data: [data.toString("base64"), "base64"],
      owner: PACK_PROGRAM_ID,
      executable: false,
      rentEpoch: 0,
    },
  })
);
console.log(receipt);
