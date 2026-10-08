// Kit-native wire boundary, checked against the generated Anchor IDL in tests.
import { createHash } from "node:crypto";
import {
  addDecoderSizePrefix,
  addEncoderSizePrefix,
  fixDecoderSize,
  getAddressDecoder,
  getAddressEncoder,
  getArrayDecoder,
  getArrayEncoder,
  getBooleanDecoder,
  getBytesDecoder,
  getStructDecoder,
  getStructEncoder,
  getU8Decoder,
  getU8Encoder,
  getU32Decoder,
  getU32Encoder,
  getU64Decoder,
  getU64Encoder,
  getUtf8Decoder,
  getUtf8Encoder,
} from "@solana/kit";

export const discriminator = (kind: "account" | "global", name: string) =>
  createHash("sha256").update(`${kind}:${name}`).digest().subarray(0, 8);
const string = addDecoderSizePrefix(getUtf8Decoder(), getU32Decoder());
const drop = getStructDecoder([
  ["variant", getU8Decoder()],
  ["weight", getU32Decoder()],
  ["name", string],
  ["uri", string],
]);
const config = getStructDecoder([
  ["admin", getAddressDecoder()],
  ["treasury", getAddressDecoder()],
  ["collection", getAddressDecoder()],
  ["mintAuthority", getAddressDecoder()],
  ["version", getU32Decoder()],
  ["paused", getBooleanDecoder()],
  ["bump", getU8Decoder()],
]);
const edition = getStructDecoder([
  ["version", getU32Decoder()],
  ["price", getU64Decoder()],
  ["treasury", getAddressDecoder()],
  ["collection", getAddressDecoder()],
  ["mintAuthority", getAddressDecoder()],
  ["drops", getArrayDecoder(drop)],
  ["bump", getU8Decoder()],
]);
const receipt = getStructDecoder([
  ["buyer", getAddressDecoder()],
  ["edition", getAddressDecoder()],
  ["nonce", fixDecoderSize(getBytesDecoder(), 32)],
  ["callerSeed", fixDecoderSize(getBytesDecoder(), 32)],
  ["randomness", fixDecoderSize(getBytesDecoder(), 32)],
  ["price", getU64Decoder()],
  ["state", getU8Decoder()],
  ["dropIndex", getU8Decoder()],
  ["bump", getU8Decoder()],
]);
export function decodeConfig(bytes: Uint8Array) {
  check("Config", bytes);
  return config.decode(bytes.subarray(8));
}
export function decodeEdition(bytes: Uint8Array) {
  check("Edition", bytes);
  return edition.decode(bytes.subarray(8));
}
export function decodeReceipt(bytes: Uint8Array) {
  check("Receipt", bytes);
  const r = receipt.decode(bytes.subarray(8));
  if (r.state > 2) throw new Error("Invalid pack state");
  return r;
}
function check(name: string, bytes: Uint8Array) {
  if (!Buffer.from(bytes.subarray(0, 8)).equals(discriminator("account", name)))
    throw new Error("Invalid pack account");
}
export function buyPackData(
  nonce: Uint8Array,
  version: number,
  amount: string
): Uint8Array {
  if (
    nonce.length !== 32 ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !/^[1-9]\d{0,15}$/.test(amount)
  )
    throw new Error("Invalid pack quote");
  const args = Buffer.alloc(44);
  args.set(nonce);
  args.writeUInt32LE(version, 32);
  args.writeBigUInt64LE(BigInt(amount), 36);
  return Buffer.concat([discriminator("global", "buy_pack"), args]);
}
const textEncoder = addEncoderSizePrefix(getUtf8Encoder(), getU32Encoder());
const dropEncoder = getStructEncoder([
  ["variant", getU8Encoder()],
  ["weight", getU32Encoder()],
  ["name", textEncoder],
  ["uri", textEncoder],
]);
const editionEncoder = getStructEncoder([
  ["version", getU32Encoder()],
  ["price", getU64Encoder()],
  ["drops", getArrayEncoder(dropEncoder)],
]);
export function publishEditionData(
  version: number,
  price: bigint,
  drops: Array<{ variant: number; weight: number; name: string; uri: string }>
) {
  return Buffer.concat([
    discriminator("global", "publish_edition"),
    Uint8Array.from(editionEncoder.encode({ version, price, drops })),
  ]);
}
export const addressBytes = (
  value: Parameters<ReturnType<typeof getAddressEncoder>["encode"]>[0]
) => Buffer.from(getAddressEncoder().encode(value));
