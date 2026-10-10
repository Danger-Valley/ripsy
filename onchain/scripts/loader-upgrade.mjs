// Loader-v3 ABI from solana-loader-v3-interface 3.0.0, instruction.rs.
// ExtendProgram (6), then authority-signed Upgrade (3) in a later block.
// Mainnet on 2026-10-10 rejects the newer feature-gated checked extension (9).
import { publicKey } from "@metaplex-foundation/umi";
export const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export function upgradeInstructions(
  program,
  programData,
  buffer,
  authority,
  growth
) {
  if (!Number.isSafeInteger(growth) || growth < 0 || growth > 100000)
    throw new Error("Invalid growth");
  const key = (pubkey, isWritable = false, isSigner = false) => ({
    pubkey: publicKey(pubkey),
    isWritable,
    isSigner,
  });
  const instructions = [];
  if (growth) {
    const data = Buffer.alloc(8);
    data.writeUInt32LE(6);
    data.writeUInt32LE(growth, 4);
    instructions.push({
      programId: publicKey(LOADER),
      data,
      keys: [
        key(programData, true),
        key(program, true),
        key("11111111111111111111111111111111"),
        key(authority, true, true),
      ],
    });
  }
  const data = Buffer.alloc(4);
  data.writeUInt32LE(3);
  instructions.push({
    programId: publicKey(LOADER),
    data,
    keys: [
      key(programData, true),
      key(program, true),
      key(buffer, true),
      key(authority, true),
      key("SysvarRent111111111111111111111111111111111"),
      key("SysvarC1ock11111111111111111111111111111111"),
      key(authority, false, true),
    ],
  });
  return instructions;
}
