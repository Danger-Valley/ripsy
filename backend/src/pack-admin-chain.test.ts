import assert from 'node:assert/strict';
import test from 'node:test';
import { address, getProgramDerivedAddress } from '@solana/kit';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, lamports, publicKey, type RpcInterface } from '@metaplex-foundation/umi';
import { Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getCollectionV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/collectionV1AccountData.js';
import { PACK_PROGRAM_ID } from '@rps/core/packs';
import type { AdminPublication } from '@rps/core/shop-admin';
import { createPackAdminChain, parseAdminPackDraft } from './pack-admin-chain.js';
import { addressBytes, decodeEdition, discriminator, publishEditionData } from './pack-codec.js';
import { loadShopConfig } from './shop-config.js';
import { FIGURES } from './figure-registry.js';

const input = { expectedVersion: 2, price: '1099', drops: [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }] };
test('pack price initialization/update have exact CAS inputs, one admin signature and no edition allocation or odds mutation', async () => {
  const f = await fixture(); const drops = (await f.chain.catalog()).drops;
  f.umi.rpc.simulateTransaction = (async () => ({ err: null, accounts: [{ lamports: 98930120 }], logs: [] })) as unknown as RpcInterface['simulateTransaction'];
  const first = await f.chain.preparePrice({ expectedVersion: 2, expectedPrice: '1099000000', expectedRevision: '0', price: '10' });
  const tx = f.umi.transactions.deserialize(Buffer.from(first.transaction, 'base64')); const ix = tx.message.instructions[0]!;
  assert.deepEqual([...ix.data.subarray(0, 8)], [...discriminator('global', 'initialize_edition_price')]);
  assert.equal(Buffer.from(ix.data).readUInt32LE(8), 2); assert.equal(Buffer.from(ix.data).readBigUInt64LE(12), 1099000000n);
  assert.equal(Buffer.from(ix.data).readBigUInt64LE(20), 10000000n);
  assert.equal(tx.message.accounts[ix.accountIndexes[2]!], f.oldEdition); assert.equal(tx.message.accounts[ix.accountIndexes[3]!], f.pricingKey);
  assert.equal(tx.message.header.numRequiredSignatures, 1); assert.ok(!tx.message.accounts.includes(f.nextEdition));
  assert.deepEqual(first.catalog.drops, drops); assert.equal(first.catalog.version, 2); assert.equal(first.networkFeeLamports, '1069880');
  f.setPrice(10_000_000n);
  assert.equal((await f.chain.catalog()).payment.amount, '10000000'); assert.equal((await f.chain.catalog()).priceRevision, '1');
  await assert.rejects(() => f.chain.preparePrice({ expectedVersion: 2, expectedPrice: '1099000000', expectedRevision: '0', price: '1' }), /price or edition changed/);
  f.umi.rpc.simulateTransaction = (async () => ({ err: null, accounts: [{ lamports: 99995000 }], logs: [] })) as unknown as RpcInterface['simulateTransaction'];
  const next = await f.chain.preparePrice({ expectedVersion: 2, expectedPrice: '10000000', expectedRevision: '1', price: '12.345678' });
  const update = f.umi.transactions.deserialize(Buffer.from(next.transaction, 'base64')).message.instructions[0]!;
  assert.deepEqual([...update.data.subarray(0, 8)], [...discriminator('global', 'set_edition_price')]);
  assert.equal(Buffer.from(update.data).readBigUInt64LE(12), 1n); assert.equal(Buffer.from(update.data).readBigUInt64LE(20), 10000000n);
  assert.equal(Buffer.from(update.data).readBigUInt64LE(28), 12345678n); assert.equal(next.networkFeeLamports, '5000');
  await assert.rejects(() => f.chain.prepare(f.catalog), /price changed/);
});
test('price update recovery requires exact finalized transaction proof even after later price changes', async () => {
  const f = await fixture();
  const prepared = await f.chain.preparePrice({ expectedVersion: 2, expectedPrice: '1099000000', expectedRevision: '0', price: '10' });
  const job: AdminPublication = { ...prepared, kind: 'price', id: 'a'.repeat(64), buyer: f.admin.publicKey, cluster: 'mainnet-beta', createdAt: 1, status: 'prepared', signature: null };
  f.setHeight(101); assert.equal(await f.chain.status(job), 'expired');
  f.setPrice(12_000_000n, 2n);
  assert.equal(await f.chain.status(job), 'superseded');
  f.umi.rpc.call = (async method => method === 'getBlockHeight' ? 101 : [{ signature: '1'.repeat(64) }]) as RpcInterface['call'];
  f.umi.rpc.getTransaction = (async () => ({ serializedMessage: f.umi.transactions.deserialize(Buffer.from(job.transaction, 'base64')).serializedMessage, meta: { err: null } })) as unknown as RpcInterface['getTransaction'];
  assert.equal(await f.chain.status(job), 'confirmed');
  f.umi.rpc.getTransaction = async () => null;
  await assert.rejects(() => f.chain.status(job), /reconciliation/);
});
async function fixture() {
  const umi = createUmi('http://localhost:8899'); const admin = generateSigner(umi); const authority = generateSigner(umi);
  const collection = generateSigner(umi).publicKey; const treasury = generateSigner(umi).publicKey;
  const config = { ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta' as const, treasury, collection, authoritySecret: JSON.stringify([...authority.secretKey]) };
  const pda = async (seeds: Uint8Array[]) => publicKey((await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID), seeds }))[0]);
  const utf = (s: string) => new TextEncoder().encode(s);
  const root = await pda([utf('config')]); const n = Buffer.alloc(4); n.writeUInt32LE(2);
  const oldEdition = await pda([utf('edition'), n]); const m = Buffer.alloc(4); m.writeUInt32LE(3); const nextEdition = await pda([utf('edition'), m]);
  const [pricingKey, pricingBump] = await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID), seeds: [utf('price'), addressBytes(address(oldEdition))] });
  let price: bigint | null = null; let revision = 0n;
  const rootData = Buffer.concat([discriminator('account', 'Config'), ...[admin.publicKey, treasury, collection, authority.publicKey].map(v => addressBytes(address(v))), n, Buffer.from([0, 255])]);
  const editionData = (version: number) => {
    const wire = publishEditionData(version, 1099000000n, input.drops.map(d => { const f = FIGURES.find(f => f.id === d.figureId)!; return { variant: f.variant, weight: d.weight, name: f.name, uri: `${config.publicOrigin}/figures/${f.id}.json` }; }));
    return Buffer.concat([discriminator('account', 'Edition'), wire.subarray(8, 20), ...[treasury, collection, authority.publicKey].map(v => addressBytes(address(v))), wire.subarray(20), Buffer.from([255])]);
  };
  let published = false; let wrongOwner = false; let wrongAdmin = false; let height = 90; let currentVersion = 2; let genesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  const collectionData = getCollectionV1AccountDataSerializer().serialize({ key: Key.CollectionV1, updateAuthority: authority.publicKey, name: 'RIPSY', uri: config.publicOrigin, numMinted: 0, currentSize: 0 });
  umi.rpc.getAccount = async key => {
    if (key === publicKey(pricingKey)) {
      if (price === null) return { exists: false, publicKey: key };
      const values = Buffer.alloc(17); values.writeBigUInt64LE(price); values.writeBigUInt64LE(revision, 8); values[16] = pricingBump;
      return { exists: true, publicKey: key, owner: publicKey(PACK_PROGRAM_ID), executable: false, lamports: lamports(1064880n), data: Buffer.concat([discriminator('account', 'EditionPrice'), values]) };
    }
    if (key === nextEdition && !published) return { exists: false, publicKey: key };
    const currentRoot = Buffer.from(rootData); currentRoot.writeUInt32LE(currentVersion, 136); if (wrongAdmin) currentRoot.set(addressBytes(address(treasury)), 8);
    return { exists: true, publicKey: key, owner: key === collection ? MPL_CORE_PROGRAM_ID : wrongOwner ? MPL_CORE_PROGRAM_ID : publicKey(PACK_PROGRAM_ID),
      lamports: lamports(10000000n), executable: key === publicKey(PACK_PROGRAM_ID),
      data: key === collection ? collectionData : key === root ? currentRoot : key === oldEdition ? editionData(2) : key === nextEdition ? editionData(3) : new Uint8Array(),
    };
  };
  umi.rpc.getLatestBlockhash = async () => ({ blockhash: publicKey('11111111111111111111111111111111'), lastValidBlockHeight: 100 });
  umi.rpc.getBalance = async () => lamports(100000000n);
  umi.rpc.call = (async method => method === 'getGenesisHash' ? genesis : method === 'getBlockHeight' ? height : []) as RpcInterface['call'];
  umi.rpc.simulateTransaction = (async () => ({ err: null, accounts: [{ lamports: 53700960 }], logs: [] })) as unknown as RpcInterface['simulateTransaction'];
  umi.rpc.getSignatureStatuses = async () => [null];
  const verified: string[] = [];
  const verify = async (f: { id: string; name: string }) => { verified.push(f.id); };
  const chain = createPackAdminChain(config, admin.publicKey, umi, verify);
  const catalog = parseAdminPackDraft(input);
  const makeJob = async (): Promise<AdminPublication> => ({ ...await chain.prepare(catalog), id: 'a'.repeat(64), buyer: admin.publicKey, cluster: 'mainnet-beta', catalog, status: 'prepared', signature: null, createdAt: 1 });
  return { umi, chain, admin, authority, collection, config, catalog, makeJob, verified, nextEdition, editionData,
    pricingKey, oldEdition, setPrice(value: bigint | null, rev = 1n) { price = value; revision = rev; },
    setPublished(v: boolean) { published = v; }, setVersion(v: number) { currentVersion = v; }, setHeight(v: number) { height = v; }, setOwner(v: boolean) { wrongOwner = v; }, setAdmin(v: boolean) { wrongAdmin = v; }, setGenesis(v: string) { genesis = v; }, verify };
}
test('publication wire uses only admin signature, exact next edition/price/weights and no private authority signature', async () => {
  const f = await fixture(); const active = await f.chain.catalog(); assert.equal(active.version, 2);
  const job = await f.makeJob(); const tx = f.umi.transactions.deserialize(Buffer.from(job.transaction, 'base64'));
  assert.equal(tx.message.header.numRequiredSignatures, 1); assert.equal(tx.message.accounts[0], f.admin.publicKey);
  assert.equal(tx.message.instructions.length, 1); const ix = tx.message.instructions[0]!;
  assert.equal(tx.message.accounts[ix.programIndex], PACK_PROGRAM_ID); assert.equal(tx.message.accounts[ix.accountIndexes[2]!], f.nextEdition);
  assert.equal(Buffer.from(ix.data).readUInt32LE(8), 3); assert.equal(Buffer.from(ix.data).readBigUInt64LE(12), 1099000000n);
  assert.ok(!tx.message.accounts.includes(f.authority.publicKey)); assert.ok(tx.signatures[0]!.every(b => b === 0));
  assert.equal(job.networkFeeLamports, '46299040'); assert.deepEqual(f.verified, ['jup', 'bonk', 'ore']);
  assert.equal(decodeEdition(f.editionData(3)).drops[2]!.weight, 200000);
  const signed = await f.admin.signTransaction(tx); const encoded = Buffer.from(f.umi.transactions.serialize(signed)).toString('base64');
  assert.ok(f.chain.validateSigned(job, encoded)); assert.throws(() => f.chain.validateSigned(job, job.transaction), /signature/);
  const bytes = Uint8Array.from(signed.serializedMessage); const offset = Buffer.from(bytes).indexOf(Buffer.from(ix.data)) + 12;
  bytes[offset] = bytes[offset]! ^ 1;
  assert.throws(() => f.chain.validateSigned(job, Buffer.from(f.umi.transactions.serialize({ ...signed, serializedMessage: bytes })).toString('base64')), /message or administrator signature/);
  assert.throws(() => f.chain.validateSigned({ ...job, buyer: f.authority.publicKey }, encoded), /signature/);
});
test('wrong network/admin/owner, stale edition, missing metadata and failed simulation never prepare a publishable transaction', async () => {
  const f = await fixture();
  await assert.rejects(() => f.chain.prepare({ ...f.catalog, version: 4 }), /active edition changed/);
  f.setAdmin(true); await assert.rejects(() => f.chain.catalog(), /administrator/); f.setAdmin(false);
  f.setOwner(true); await assert.rejects(() => f.chain.catalog(), /configuration/); f.setOwner(false);
  f.setGenesis('devnet'); await assert.rejects(() => f.makeJob(), /network/); f.setGenesis('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
  const missing = createPackAdminChain(f.config, f.admin.publicKey, f.umi, async () => { throw new Error('Missing or changed image'); });
  await assert.rejects(() => missing.prepare(f.catalog), /metadata\/preview not ready/);
  f.umi.rpc.simulateTransaction = (async () => ({ err: 'InsufficientFunds', logs: [] })) as unknown as RpcInterface['simulateTransaction'];
  await assert.rejects(() => f.makeJob(), /simulation failed/);
});
test('oversized editions fail explicitly instead of dropping rewards or truncating the transaction', async () => {
  const f = await fixture(); const oversized = createPackAdminChain({ ...f.config, publicOrigin: `${f.config.publicOrigin}/${'x'.repeat(800)}` }, f.admin.publicKey, f.umi, f.verify);
  await assert.rejects(() => oversized.prepare(f.catalog), /transaction size limit/);
});
test('unreturned wallet broadcast recovers by finalized exact edition data; unknown results never trigger another publication', async () => {
  const f = await fixture(); const job = await f.makeJob(); assert.equal(await f.chain.status(job), 'prepared');
  f.setHeight(101); assert.equal(await f.chain.status(job), 'expired');
  f.setVersion(3); await assert.rejects(() => f.chain.status(job), /inconsistent/);
  f.setPublished(true); assert.equal(await f.chain.status(job), 'confirmed');
  assert.equal(await f.chain.status({ ...job, catalog: { ...job.catalog, payment: { ...job.catalog.payment, amount: '1' } } }), 'superseded');
  f.umi.rpc.getSignatureStatuses = async () => [{ commitment: 'processed', error: null } as never];
  assert.equal(await f.chain.status({ ...job, signature: '1'.repeat(64) }), 'submitted');
  f.umi.rpc.getSignatureStatuses = async () => [{ commitment: 'confirmed', error: null } as never];
  assert.equal(await f.chain.status({ ...job, signature: '1'.repeat(64) }), 'confirmed');
});
