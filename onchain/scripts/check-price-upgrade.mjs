// Read-only readiness/cost report. No private keys, signing, or broadcasting.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
const program = '43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ';
const admin = 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh';
const originalHash = '199b77db47f82812d115346f706dffa9913f3f207ca3ff13825f4746a5b8d256';
const targetHash = '530e0b4cacbb91bf4280a33887aa19eb9c2aa0fb9e2f08cce584383bc93f3ac4';
const binary = readFileSync('onchain/target/deploy/ripsy_packs.so');
const hash = b => createHash('sha256').update(b).digest('hex');
try {
  const url = process.env.SHOP_SOLANA_RPC_URL;
  if (hash(binary) !== targetHash) throw new Error('Reviewed build mismatch');
  if (!url || new URL(url).protocol !== 'https:') throw new Error();
  const umi = createUmi(url, { commitment: 'finalized', fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(15000) }) });
  if (await umi.rpc.call('getGenesisHash') !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error();
  const p = await umi.rpc.getAccount(publicKey(program));
  if (!p.exists || !p.executable || p.owner !== publicKey('BPFLoaderUpgradeab1e11111111111111111111111')) throw new Error();
  const key = base58.deserialize(p.data.subarray(4, 36))[0]; const d = await umi.rpc.getAccount(publicKey(key));
  if (!d.exists || d.owner !== p.owner || d.data[12] !== 1 || base58.deserialize(d.data.subarray(13, 45))[0] !== admin) throw new Error();
  const currentHash = hash(d.data.subarray(45));
  if (![originalHash, targetHash].includes(currentHash)) throw new Error('Unexpected existing program');
  const rent = async size => Number(await umi.rpc.call('getMinimumBalanceForRentExemption', [size]));
  const targetSize = Math.max(d.data.length, binary.length + 45);
  const [targetRent, bufferRent, compactRent, pricingRent, balance] = await Promise.all([
    rent(targetSize), rent(binary.length + 37), rent(285), rent(25), umi.rpc.getBalance(publicKey(admin)),
  ]);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), program, programData: key, upgradeAuthority: admin,
    originalSha256: originalHash, targetSha256: hash(binary), originalBinaryBytes: 449184, currentBinaryBytes: d.data.length - 45, targetBinaryBytes: binary.length,
    currentSha256: currentHash, upgradeActivated: currentHash === targetHash,
    programGrowthRentLamports: Math.max(0, targetRent - Number(d.lamports.basisPoints)),
    temporaryBufferRentLamports: bufferRent, adminBalanceLamports: balance.basisPoints.toString(),
    threeDropEditionRentLamports: compactRent, firstPriceAccountRentLamports: pricingRent,
    transactionFeesExcluded: true, mainnetTransactionSent: false }, null, 2));
} catch {
  console.error('Upgrade read-only checks failed. Verify the configured mainnet RPC, program binary and authority. Sensitive diagnostics suppressed.'); process.exitCode = 1;
}
