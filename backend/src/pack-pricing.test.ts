import assert from 'node:assert/strict';
import test from 'node:test';
import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, publicKey, lamports, type PublicKey } from '@metaplex-foundation/umi';
import { PACK_PROGRAM_ID } from '@rps/core/packs';
import { discriminator } from './pack-codec.js';
import { packPricing } from './pack-pricing.js';

test('legacy/missing and empty system-owned price PDAs retain the original price', async () => {
  const umi = createUmi('http://localhost:8899'); const edition = generateSigner(umi).publicKey;
  umi.rpc.getAccount = async key => ({ exists: false, publicKey: key });
  assert.equal((await packPricing(umi, edition, 1099000000n)).revision, 0n);
  umi.rpc.getAccount = async key => ({ exists: true, publicKey: key, data: new Uint8Array(), lamports: lamports(1n), executable: false, owner: publicKey('11111111111111111111111111111111') });
  assert.equal((await packPricing(umi, edition, 1099000000n)).price, 1099000000n);
});
test('present pricing validates owner, discriminator, exact length, positive values and canonical bump without fallback', async () => {
  const umi = createUmi('http://localhost:8899'); const edition = generateSigner(umi).publicKey;
  const [key, bump] = await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID), seeds: [new TextEncoder().encode('price'), getAddressEncoder().encode(address(edition))] });
  const fields = Buffer.alloc(17); fields.writeBigUInt64LE(10000000n); fields.writeBigUInt64LE(1n, 8); fields[16] = bump;
  let data = Buffer.concat([discriminator('account', 'EditionPrice'), fields]); let owner: PublicKey = publicKey(PACK_PROGRAM_ID);
  umi.rpc.getAccount = async requested => { assert.equal(requested, key); return { exists: true, publicKey: requested, data, lamports: lamports(777240n), executable: false, owner }; };
  assert.deepEqual(await packPricing(umi, edition, 1099000000n), { key, price: 10000000n, revision: 1n });
  const valid = Buffer.from(data);
  for (const position of [0, 24]) { data = Buffer.from(valid); data[position] = data[position]! ^ 1; await assert.rejects(() => packPricing(umi, edition, 1099000000n)); }
  for (const offset of [8, 16]) { data = Buffer.from(valid); data.fill(0, offset, offset + 8); await assert.rejects(() => packPricing(umi, edition, 1099000000n)); }
  data = Buffer.concat([valid, Buffer.from([0])]); await assert.rejects(() => packPricing(umi, edition, 1099000000n));
  data = valid; owner = publicKey('11111111111111111111111111111111'); await assert.rejects(() => packPricing(umi, edition, 1099000000n), /owner/);
});
