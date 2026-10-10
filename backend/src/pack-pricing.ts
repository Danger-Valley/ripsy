import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { publicKey, type Umi } from '@metaplex-foundation/umi';
import { PACK_PROGRAM_ID } from '@rps/core/packs';
import { decodeEditionPrice } from './pack-codec.js';

/** Absent PDA preserves legacy prices. A malformed/present account never falls back. */
export async function packPricing(umi: Umi, edition: string, original: bigint, commitment: 'confirmed' | 'finalized' = 'confirmed') {
  const [key, bump] = await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID),
    seeds: [new TextEncoder().encode('price'), getAddressEncoder().encode(address(edition))] });
  const account = await umi.rpc.getAccount(publicKey(key), { commitment });
  if (!account.exists || (account.owner === publicKey('11111111111111111111111111111111') && account.data.length === 0))
    return { key, price: original, revision: 0n };
  if (account.owner !== publicKey(PACK_PROGRAM_ID)) throw new Error('Invalid pack price owner');
  const p = decodeEditionPrice(account.data);
  if (p.bump !== bump) throw new Error('Invalid pack price PDA');
  return { key, price: p.price, revision: p.revision };
}
