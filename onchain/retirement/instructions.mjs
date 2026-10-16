import { AccountRole, address } from "@solana/kit";
import { publicKey } from "@metaplex-foundation/umi";

export const PROGRAM = "43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ";
export const PROGRAM_DATA = "DZeMqKpHuE98CmdjbN4cgjXjGktUosgsCUGgScniEG3Y";
export const ADMIN = "BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh";
export const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const STATE = [
  "2Pf3Q6MyrsNzzEPxMUNGTHqmWP5ZP92rNpakeVkRPrZw",
  "6Pw2BSWhfpNE9sDrPbpwnUNVwp41YZfFd93b7AHifVVx",
  "By91HTLcHiWsHSyzMRMWj9HofiangTGU7Lqr2ifV29qY",
  "GXTL36kxVXCTH6pZcQWYQmPD6E1fcJSsCW4yJeokWXPT",
];
const meta = (key, role) => ({ address: address(key), role });
export const cleanupInstruction = (state) => ({
  programAddress: address(PROGRAM),
  accounts: [
    meta(ADMIN, AccountRole.WRITABLE_SIGNER),
    meta(state, AccountRole.WRITABLE),
  ],
  data: new Uint8Array(),
});
export const closeInstruction = () => ({
  programAddress: address(LOADER),
  accounts: [
    meta(PROGRAM_DATA, AccountRole.WRITABLE),
    meta(ADMIN, AccountRole.WRITABLE),
    meta(ADMIN, AccountRole.READONLY_SIGNER),
    meta(PROGRAM, AccountRole.WRITABLE),
  ],
  data: Uint8Array.of(5, 0, 0, 0),
});
// Existing Umi signing stack is kept at this boundary, as in loader-upgrade.mjs.
export const umiItem = (ix, signer) => ({
  instruction: {
    programId: publicKey(ix.programAddress),
    data: ix.data,
    keys: ix.accounts.map((a) => ({
      pubkey: publicKey(a.address),
      isWritable:
        a.role === AccountRole.WRITABLE ||
        a.role === AccountRole.WRITABLE_SIGNER,
      isSigner:
        a.role === AccountRole.READONLY_SIGNER ||
        a.role === AccountRole.WRITABLE_SIGNER,
    })),
  },
  signers: [signer],
  bytesCreatedOnChain: 0,
});
