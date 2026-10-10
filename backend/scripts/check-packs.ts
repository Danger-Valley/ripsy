/** Read-only mainnet readiness checks. Prints public configuration, never secrets. */
import { readFileSync } from 'node:fs';
import { address, getProgramDerivedAddress } from '@solana/kit';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import { INITIAL_PACK, PACK_PROGRAM_ID } from '@rps/core/packs';
import { FIGURES } from '../src/figure-registry.js';
import { decodeConfig, decodeEdition } from '../src/pack-codec.js';
import { loadShopConfig } from '../src/shop-config.js';
import { verifyPackFigureResources } from '../src/pack-metadata.js';
import { packPricing } from '../src/pack-pricing.js';

async function main() {
  const config = loadShopConfig(process.env);
  if (config.cluster !== 'mainnet-beta' || !config.collection || !config.authoritySecret)
    throw new Error('Configured mainnet collection and authority required');
  const umi = createUmi(config.rpcUrl, { commitment: 'finalized' });
  if (await umi.rpc.call('getGenesisHash') !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')
    throw new Error('Wrong network');
  const mintAuthority = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(JSON.parse(config.authoritySecret))).publicKey;
  const collection = await fetchCollection(umi, publicKey(config.collection));
  if (collection.updateAuthority !== mintAuthority) throw new Error('Core collection authority mismatch');
  const utf = (s: string) => new TextEncoder().encode(s);
  const pda = async (seeds: Uint8Array[]) => (await getProgramDerivedAddress({
    programAddress: address(PACK_PROGRAM_ID), seeds,
  }))[0];
  const root = await pda([utf('config')]);
  const rootAccount = await umi.rpc.getAccount(publicKey(root));
  if (rootAccount.exists && String(rootAccount.owner) !== PACK_PROGRAM_ID)
    throw new Error('Invalid config owner');
  const current = rootAccount.exists ? decodeConfig(rootAccount.data) : null;
  const version = Buffer.alloc(4); version.writeUInt32LE(current?.version || 1);
  const editionAddress = await pda([utf('edition'), version]);
  const editionAccount = await umi.rpc.getAccount(publicKey(editionAddress));
  if (editionAccount.exists && String(editionAccount.owner) !== PACK_PROGRAM_ID)
    throw new Error('Invalid edition owner');
  const edition = editionAccount.exists ? decodeEdition(editionAccount.data) : null;
  const pricing = edition ? await packPricing(umi, editionAddress, edition.price, 'finalized') : null;
  const accounts = await umi.rpc.call('getMultipleAccounts', [[
    'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz',
    'Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh',
  ], { encoding: 'base64', commitment: 'finalized' }]) as {
    value: Array<{ owner: string; executable: boolean; data: [string, string] } | null>;
  };
  const origin = new URL(config.publicOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash)
    throw new Error('Public HTTPS metadata origin required');
  const resources = [];
  const drops = edition?.drops ?? INITIAL_PACK.drops.map(drop => ({
    variant: FIGURES.find(f => f.id === drop.figureId)!.variant,
  }));
  for (const drop of drops) {
    const figure = FIGURES.find(f => f.variant === drop.variant && f.purchasable && !f.seekerExclusive);
    if (!figure) throw new Error('Unsupported published pack figure');
    const uri = `${config.publicOrigin}/figures/${figure.id}.json`;
    const image = `${config.publicOrigin}/figures/${figure.id}.png`;
    let metadataOk = false, imageOk = false;
    try {
      await verifyPackFigureResources(config.publicOrigin, figure,
        readFileSync(`frontend/apps/web/public/figures/${figure.id}.png`));
      metadataOk = imageOk = true;
    } catch { /* Preserve a public readiness failure without leaking RPC URLs. */ }
    resources.push({ figureId: figure.id, uri, image, metadataOk, imageOk });
  }
  const authorityBalance = await umi.rpc.getBalance(mintAuthority);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), network: 'mainnet-beta',
    program: PACK_PROGRAM_ID, collection: config.collection, collectionName: collection.name,
    treasury: config.treasury, mintAuthority, mintAuthoritySol: Number(authorityBalance.basisPoints) / 1e9,
    configAddress: root, config: current, editionAddress,
    edition: edition ? { ...edition, price: edition.price.toString() } : null,
    currentPricing: pricing ? { account: pricing.key, price: pricing.price.toString(), revision: pricing.revision.toString() } : null,
    vrfExecutable: accounts.value[0]?.executable === true,
    vrfQueueValid: accounts.value[1]?.owner === 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz',
    localBackendPackEnabled: process.env.PACK_ENABLED === 'true', resources,
  }, null, 2));
  if (!accounts.value[0]?.executable || accounts.value[1]?.owner !== 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz' ||
      resources.some(r => !r.metadataOk || !r.imageOk)) process.exitCode = 2;
}
main().catch(() => {
  console.error('Pack readiness check failed. Sensitive diagnostics suppressed.');
  process.exitCode = 1;
});
