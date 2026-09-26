import { readFileSync } from 'node:fs';
import { createCollection, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { base58 } from '@metaplex-foundation/umi/serializers';

const CLUSTERS = {
  devnet: {
    coreExplorerQuery: '?env=devnet',
    transactionExplorerQuery: '?cluster=devnet',
    genesis: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  },
  'mainnet-beta': {
    coreExplorerQuery: '',
    transactionExplorerQuery: '',
    genesis: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  },
} as const;

type Cluster = keyof typeof CLUSTERS;

const create = process.argv.includes('--create');
const cluster = readCluster(process.env.SHOP_SOLANA_CLUSTER);
const rpcUrl = required('SHOP_SOLANA_RPC_URL');
const authoritySecret = readSecret(readAuthoritySecret());
const publicOrigin = (process.env.SHOP_PUBLIC_ORIGIN ?? 'https://www.ripsy.fun').replace(/\/$/, '');
const metadataUri = `${publicOrigin}/figures/collection.json`;
const collectionName = 'RIPSY Originals';

const umi = createUmi(rpcUrl, {
  commitment: 'confirmed',
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
}).use(mplCore());
const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(authoritySecret);
umi.use(keypairIdentity(authorityKeypair));
const authority = umi.identity;

const existingCollection = process.env.SHOP_COLLECTION_ADDRESS?.trim();
if (existingCollection) {
  const collection = await fetchCollection(umi, publicKey(existingCollection));
  if (collection.updateAuthority !== authority.publicKey) {
    throw new Error('SHOP_COLLECTION_ADDRESS is not controlled by SHOP_MINT_AUTHORITY_SECRET');
  }
  await assertDasInventorySupport(rpcUrl, String(authority.publicKey));
  console.log('The configured Core Collection is valid.');
  console.log('The configured shop RPC supports DAS inventory queries.');
  console.log(`SHOP_COLLECTION_ADDRESS=${collection.publicKey}`);
  process.exit(0);
}

const [genesis, balance, metadataResponse] = await Promise.all([
  umi.rpc.call<string>('getGenesisHash'),
  umi.rpc.getBalance(authority.publicKey),
  fetch(metadataUri, { signal: AbortSignal.timeout(15_000) }),
]);

if (genesis !== CLUSTERS[cluster].genesis) {
  throw new Error(`SHOP_SOLANA_RPC_URL is not connected to ${cluster}`);
}
if (!metadataResponse.ok) {
  throw new Error(`Collection metadata is not public yet: ${metadataUri} returned ${metadataResponse.status}`);
}
const metadata = await metadataResponse.json() as Record<string, unknown>;
if (metadata.name !== collectionName || typeof metadata.image !== 'string' || !metadata.image.startsWith('https://')) {
  throw new Error(`Invalid collection metadata at ${metadataUri}`);
}

const collection = generateSigner(umi);
const blockhash = await umi.rpc.getLatestBlockhash();
const builder = createCollection(umi, {
  collection,
  updateAuthority: authority.publicKey,
  payer: authority,
  name: collectionName,
  uri: metadataUri,
}).setBlockhash(blockhash);

const transaction = await builder.buildAndSign(umi);
const simulation = await umi.rpc.simulateTransaction(transaction, {
  accounts: [authority.publicKey],
  verifySignatures: true,
});
if (simulation.err) {
  throw new Error(`Collection transaction simulation failed: ${JSON.stringify(simulation.err)}\n${simulation.logs?.join('\n') ?? ''}`);
}
const simulatedAuthorityBalance = simulation.accounts?.[0]?.lamports;
if (simulatedAuthorityBalance === undefined || !Number.isSafeInteger(simulatedAuthorityBalance)) {
  throw new Error('Unable to calculate collection creation cost from simulation');
}
const simulatedCost = balance.basisPoints - BigInt(simulatedAuthorityBalance);
if (simulatedCost <= 0n) {
  throw new Error('Simulation returned an invalid collection creation cost');
}

console.log(`Cluster: ${cluster}`);
console.log(`Authority: ${authority.publicKey}`);
console.log(`Authority balance: ${formatSol(balance.basisPoints)} SOL`);
console.log(`Metadata: ${metadataUri}`);
console.log(`Simulated transaction cost: ${formatSol(simulatedCost)} SOL`);
console.log(`Prepared collection address: ${collection.publicKey}`);

if (!create) {
  console.log('Preflight passed. No transaction was submitted.');
  console.log('Run `npm run shop:create-collection` to create the collection.');
  process.exit(0);
}

console.log('Submitting the Core Collection transaction...');
const signatureBytes = await umi.rpc.sendTransaction(transaction, {
  maxRetries: 3,
  preflightCommitment: 'confirmed',
  skipPreflight: false,
});
const confirmation = await umi.rpc.confirmTransaction(signatureBytes, {
  commitment: 'confirmed',
  strategy: { type: 'blockhash', ...blockhash },
});
if (confirmation.value.err) {
  throw new Error(`Collection transaction failed: ${JSON.stringify(confirmation.value.err)}`);
}

const created = await fetchCollection(umi, collection.publicKey);
if (created.updateAuthority !== authority.publicKey || created.name !== collectionName || created.uri !== metadataUri) {
  throw new Error('Created collection did not pass post-transaction verification');
}
await assertDasInventorySupport(rpcUrl, String(authority.publicKey));

const signature = base58.deserialize(signatureBytes)[0];
console.log('Core Collection created and verified.');
console.log(`SHOP_COLLECTION_ADDRESS=${created.publicKey}`);
console.log(`Transaction: https://explorer.solana.com/tx/${signature}${CLUSTERS[cluster].transactionExplorerQuery}`);
console.log(`Collection: https://core.metaplex.com/explorer/${created.publicKey}${CLUSTERS[cluster].coreExplorerQuery}`);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function readAuthoritySecret() {
  const inlineSecret = process.env.SHOP_MINT_AUTHORITY_SECRET?.trim();
  if (inlineSecret) return inlineSecret;
  const keypairPath = process.env.SHOP_MINT_AUTHORITY_KEYPAIR_PATH?.trim();
  if (!keypairPath) {
    throw new Error('Set SHOP_MINT_AUTHORITY_SECRET or SHOP_MINT_AUTHORITY_KEYPAIR_PATH');
  }
  try {
    return readFileSync(keypairPath, 'utf8');
  } catch {
    throw new Error(`Unable to read SHOP_MINT_AUTHORITY_KEYPAIR_PATH: ${keypairPath}`);
  }
}

function readCluster(value: string | undefined): Cluster {
  if (value === 'devnet' || value === 'mainnet-beta') return value;
  throw new Error('SHOP_SOLANA_CLUSTER must be devnet or mainnet-beta');
}

function readSecret(value: string) {
  let secret: unknown;
  try {
    secret = JSON.parse(value);
  } catch {
    throw new Error('SHOP_MINT_AUTHORITY_SECRET must be valid JSON');
  }
  if (!Array.isArray(secret) || secret.length !== 64 || !secret.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error('SHOP_MINT_AUTHORITY_SECRET must be a 64-byte JSON keypair');
  }
  return Uint8Array.from(secret);
}

function formatSol(lamports: bigint) {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function assertDasInventorySupport(url: string, ownerAddress: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'ripsy-das-preflight',
      method: 'getAssetsByOwner',
      params: { ownerAddress, page: 1, limit: 1 },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json() as { error?: unknown; result?: { items?: unknown[] } };
  if (!response.ok || body.error || !Array.isArray(body.result?.items)) {
    throw new Error('SHOP_SOLANA_RPC_URL must support DAS getAssetsByOwner for Core inventory');
  }
}
