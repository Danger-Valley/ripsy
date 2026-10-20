/** Mainnet quote/probe only. No valid transaction is signed, returned or sent. */
import assert from 'node:assert/strict';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, generateSigner, lamports, publicKey, signerIdentity, transactionBuilder } from '@metaplex-foundation/umi';
import { fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox, transferSol } from '@metaplex-foundation/mpl-toolbox';
import { parsePackCatalog } from '@rps/core/packs';
import { CORE_CREATE_FEE, packDeliveryAssetSize, packDeliveryInstructions, packDeliveryNetworkFee, preparePackDeliveryFunding } from '../src/backend-pack-delivery-funding.js';
import { loadShopConfig } from '../src/shop-config.js';
import { FIGURES } from '../src/figure-registry.js';

const config = loadShopConfig(process.env);
assert.equal(config.cluster, 'mainnet-beta'); assert.ok(config.collection);
const umi = createUmi(config.rpcUrl, { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) }).use(mplCore()).use(mplToolbox());
assert.equal(await umi.rpc.getGenesisHash(), '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
const collection = await fetchCollection(umi, publicKey(config.collection));
umi.use(signerIdentity(createNoopSigner(collection.updateAuthority)));
const simulate = umi.rpc.simulateTransaction;
let probes = 0;
umi.rpc.simulateTransaction = async (tx, options) => {
  assert.equal(options?.verifySignatures, false);
  assert.ok(tx.signatures.every(signature => signature.every(byte => byte === 0)), 'No valid signature may enter this diagnostic probe');
  probes++; return simulate(tx, options);
};
const response = await fetch('https://api.ripsy.fun/session', { method: 'POST', signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 201); const { token } = await response.json() as { token: string };
const catalogResponse = await fetch('https://api.ripsy.fun/shop/packs/catalog', { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
assert.equal(catalogResponse.status, 200); const catalog = parsePackCatalog(await catalogResponse.json());
const rewards = catalog.drops.map(drop => {
  const figure = FIGURES.find(f => f.id === drop.figureId); assert.ok(figure);
  return { figureId: figure.id, name: figure.name, uri: `${config.publicOrigin}/figures/${figure.id}.json` };
});
const buyer = createNoopSigner(publicKey(process.argv.find(arg => arg.startsWith('--buyer='))?.slice(8) ?? 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh'));
const quote = await preparePackDeliveryFunding(umi, buyer, generateSigner(umi).publicKey, collection.publicKey, rewards, await umi.rpc.getLatestBlockhash());
const deliveries = [];
for (const reward of rewards) {
  const authority = createNoopSigner(collection.updateAuthority), asset = createNoopSigner(generateSigner(umi).publicKey);
  let builder = transactionBuilder().setVersion(0).setFeePayer(authority).setBlockhash(await umi.rpc.getLatestBlockhash())
    .add(packDeliveryInstructions(umi, asset, authority, buyer.publicKey, collection.publicKey, reward));
  const [rent, network] = await Promise.all([umi.rpc.getRent(packDeliveryAssetSize(buyer.publicKey, collection.publicKey, reward)), packDeliveryNetworkFee(umi, builder.build(umi))]);
  const change = BigInt(quote.amountLamports) - rent.basisPoints - CORE_CREATE_FEE - network;
  assert.ok(change >= 0n);
  if (change) builder = builder.add(transferSol(umi, { source: authority, destination: buyer.publicKey, amount: lamports(change) }));
  const simulated = await umi.rpc.simulateTransaction(builder.build(umi), { verifySignatures: false, accounts: [asset.publicKey] });
  assert.equal(simulated.err, null);
  assert.equal(BigInt(simulated.accounts![0]!.lamports) + network + change, BigInt(quote.amountLamports));
  deliveries.push({ figure: reward.figureId, refundLamports: String(change), creationCostLamports: String(BigInt(quote.amountLamports) - change) });
}
console.log(JSON.stringify({ mainnetVerified: true, deliveryFunding: quote, deliveries, probes, authoritySigned: false, buyerSigned: false,
  noPaidOrderCreated: true, transactionsSent: false }));
