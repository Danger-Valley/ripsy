import { createNoopSigner, lamports, transactionBuilder, type BlockhashWithExpiryBlockHeight, type PublicKey, type Signer, type Transaction, type Umi } from '@metaplex-foundation/umi';
import { createV1, Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getAssetV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/assetV1AccountData.js';
import { setComputeUnitLimit, transferSol } from '@metaplex-foundation/mpl-toolbox';
import type { PackDeliveryFunding } from '@rps/core/packs';
import type { PackReward } from './backend-pack-chain.js';
import { ShopError } from './shop-error.js';

// Official Core create fee. A simulation checks it against the deployed program
// before quoting, so a fee/program change fails closed instead of underfunding.
export const CORE_CREATE_FEE = 1_500_000n;
export const MAX_PACK_DELIVERY_FUNDING = 10_000_000n;

export function packDeliveryAssetSize(owner: PublicKey, collection: PublicKey, reward: PackReward) {
  return getAssetV1AccountDataSerializer().serialize({ key: Key.AssetV1, owner,
    updateAuthority: { __kind: 'Collection', fields: [collection] }, name: reward.name, uri: reward.uri, seq: null }).length;
}
export async function packDeliveryNetworkFee(umi: Umi, tx: Transaction): Promise<bigint> {
  const fee = await umi.rpc.call<{ value: number | null }>('getFeeForMessage',
    [Buffer.from(tx.serializedMessage).toString('base64'), { commitment: 'confirmed' }]);
  if (!Number.isSafeInteger(fee?.value) || fee.value! <= 0 || fee.value! > 100_000)
    throw new ShopError('Could not estimate pack delivery fees. Please check the saved purchase again shortly.', 503);
  return BigInt(fee.value!);
}

export function packDeliveryInstructions(umi: Umi, asset: Signer, payer: Signer, owner: PublicKey, collection: PublicKey, reward: PackReward) {
  return transactionBuilder().add(setComputeUnitLimit(umi, { units: 250_000 }))
    .add(createV1(umi, { asset, payer, owner, authority: payer, collection, name: reward.name, uri: reward.uri }));
}

/** A worst-case quote independent of the eventual draw. No valid mint is signed. */
export async function preparePackDeliveryFunding(umi: Umi, buyer: Signer, assetAddress: PublicKey,
  collection: PublicKey, rewards: PackReward[], blockhash: BlockhashWithExpiryBlockHeight): Promise<PackDeliveryFunding> {
  if (!rewards.length) throw new ShopError('Pack delivery is temporarily unavailable. No payment was sent.', 503);
  const sized = rewards.map(reward => ({ reward, bytes: packDeliveryAssetSize(buyer.publicKey, collection, reward) }));
  const largest = sized.reduce((a, b) => b.bytes > a.bytes ? b : a);
  const authority = createNoopSigner(umi.identity.publicKey), asset = createNoopSigner(assetAddress);
  const instructions = packDeliveryInstructions(umi, asset, authority, buyer.publicKey, collection, largest.reward);
  const delivery = transactionBuilder().setVersion(0).setFeePayer(authority).setBlockhash(blockhash).add(instructions).build(umi);
  const [rent, fee] = await Promise.all([umi.rpc.getRent(largest.bytes), packDeliveryNetworkFee(umi, delivery)]);
  if (rent.basisPoints <= 0n)
    throw new ShopError('Could not estimate pack delivery fees. No payment was sent.', 503);
  const storage = rent.basisPoints + CORE_CREATE_FEE, amount = storage + fee;
  if (amount > MAX_PACK_DELIVERY_FUNDING) throw new ShopError('Pack delivery fees exceed the purchase limit. No payment was sent.', 503);
  // Simulate funding + creation together so this check works even when the
  // authority has no delivery reserve. Buyer pays the probe's network fee.
  // All signatures remain empty; this probe is never returned or broadcast.
  const probe = transactionBuilder().setVersion(0).setFeePayer(buyer).setBlockhash(blockhash)
    .add(transferSol(umi, { source: buyer, destination: authority.publicKey, amount: lamports(storage) }))
    .add(instructions).build(umi);
  const simulation = await umi.rpc.simulateTransaction(probe, { verifySignatures: false, accounts: [asset.publicKey] });
  const created = simulation.accounts?.[0];
  if (simulation.err) throw new ShopError('Could not prepare pack delivery. Check your SOL balance and try again. No payment was sent.', 503);
  if (!created || created.owner !== MPL_CORE_PROGRAM_ID || created.executable !== false || !Number.isSafeInteger(created.lamports)
    || BigInt(created.lamports) !== storage || !Array.isArray(created.data) || created.data[1] !== 'base64' || typeof created.data[0] !== 'string'
    || Buffer.from(created.data[0], 'base64').length !== largest.bytes)
    throw new ShopError('Pack delivery fees changed. Please try again later. No payment was sent.', 503);
  return { recipient: String(authority.publicKey), amountLamports: amount.toString() };
}
