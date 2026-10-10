import { readFileSync } from 'node:fs';
import { address, getProgramDerivedAddress } from '@solana/kit';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, publicKey, transactionBuilder, type Umi } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import { PACK_PAYMENT, PACK_PROGRAM_ID, parsePackCatalog, type PackCatalog } from '@rps/core/packs';
import { decimalToUnits, type AdminPublication, type AdminPackPriceDraft } from '@rps/core/shop-admin';
import { FIGURES } from './figure-registry.js';
import { decodeConfig, decodeEdition, publishEditionData, editionPriceData } from './pack-codec.js';
import { packPricing } from './pack-pricing.js';
import { verifyPackFigureResources } from './pack-metadata.js';
import type { ShopConfig } from './shop-config.js';
import { ShopError } from './shop-error.js';

export function parseAdminPackDraft(input: Record<string, unknown>): PackCatalog {
  try {
    if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1 || Number(input.expectedVersion) >= 0xffffffff) throw new Error('Invalid current edition.');
    const catalog = parsePackCatalog({ name: 'Fighter pack', available: true, version: Number(input.expectedVersion) + 1,
      payment: { ...PACK_PAYMENT, amount: decimalToUnits(input.price, 6, 9_999_999_999_999_999n) }, drops: input.drops });
    if (catalog.drops.some(d => !FIGURES.some(f => f.id === d.figureId && f.purchasable && !f.seekerExclusive))) throw new Error('Only registered unrestricted figures can enter a pack.');
    return catalog;
  } catch (error) { throw new ShopError((error as Error).message); }
}
export interface PackAdminChain {
  catalog(): Promise<PackCatalog & { priceRevision?: string }>;
  prepare(catalog: PackCatalog): Promise<Pick<AdminPublication, 'edition' | 'transaction' | 'lastValidBlockHeight' | 'networkFeeLamports'>>;
  preparePrice(draft: AdminPackPriceDraft): Promise<Pick<AdminPublication, 'edition' | 'catalog' | 'transaction' | 'lastValidBlockHeight' | 'networkFeeLamports' | 'priceUpdate'>>;
  validateSigned(job: AdminPublication, signed: string): string;
  send(signed: string): Promise<void>;
  status(job: AdminPublication): Promise<AdminPublication['status']>;
}
export function createPackAdminChain(config: ShopConfig, adminAddress: string | null, runtime?: Umi,
  verifyResources = async (figure: { id: string; name: string }) => {
    await verifyPackFigureResources(config.publicOrigin, figure, readFileSync(new URL(`../../frontend/apps/web/public/figures/${figure.id}.png`, import.meta.url)));
  }): PackAdminChain {
  const umi = runtime ?? createUmi(config.rpcUrl, { commitment: 'confirmed', fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) });
  const utf = (s: string) => new TextEncoder().encode(s);
  const pda = async (seeds: Uint8Array[]) => publicKey((await getProgramDerivedAddress({ programAddress: address(PACK_PROGRAM_ID), seeds }))[0]);
  const editionKey = (version: number) => { const n = Buffer.alloc(4); n.writeUInt32LE(version); return pda([utf('edition'), n]); };
  const mintAuthority = () => {
    if (!config.authoritySecret) throw new ShopError('Store authority is not configured.', 503);
    return umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(config.authoritySecret))).publicKey;
  };
  async function account(key: string, commitment: 'confirmed' | 'finalized' = 'confirmed') {
    const a = await umi.rpc.getAccount(publicKey(key), { commitment });
    if (!a.exists || a.owner !== publicKey(PACK_PROGRAM_ID)) throw new ShopError('Pack configuration is not available.', 503);
    return a.data;
  }
  async function root() {
    if (!adminAddress || !config.enabled || config.cluster !== 'mainnet-beta' || !config.collection || !config.treasury) throw new ShopError('Pack administration needs the configured mainnet store.', 503);
    const [genesis, c, collection, program] = await Promise.all([
      umi.rpc.call<string>('getGenesisHash'), account(await pda([utf('config')])),
      fetchCollection(umi, publicKey(config.collection)), umi.rpc.getAccount(publicKey(PACK_PROGRAM_ID)),
    ]);
    const current = decodeConfig(c);
    const authority = mintAuthority();
    if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' || !program.exists || !program.executable
      || current.admin !== adminAddress || current.treasury !== config.treasury || current.collection !== config.collection
      || String(current.mintAuthority) !== String(authority) || collection.updateAuthority !== authority) throw new ShopError('Pack network, administrator or store authority does not match.', 503);
    return current;
  }
  function table(e: ReturnType<typeof decodeEdition>, paused: boolean): PackCatalog {
    if (e.treasury !== config.treasury || e.collection !== config.collection || String(e.mintAuthority) !== String(mintAuthority())) throw new ShopError('Edition does not match the store.', 503);
    return parsePackCatalog({ name: 'Fighter pack', available: !paused, version: e.version, payment: { ...PACK_PAYMENT, amount: e.price.toString() },
      drops: e.drops.map(d => {
        const f = FIGURES.find(f => f.variant === d.variant && f.purchasable && !f.seekerExclusive);
        if (!f || d.name !== f.name || d.uri !== `${config.publicOrigin}/figures/${f.id}.json`) throw new ShopError('Edition contains unsupported metadata.', 503);
        return { figureId: f.id, weight: d.weight };
      }) });
  }
  const decode = (encoded: string) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 1644) throw new ShopError('Invalid publication transaction.');
    try { return umi.transactions.deserialize(Buffer.from(encoded, 'base64')); } catch { throw new ShopError('Invalid publication transaction.'); }
  };
  async function live() {
    const c = await root(); const key = await editionKey(c.version);
    const e = decodeEdition(await account(key));
    if (e.version !== c.version) throw new ShopError('Invalid active edition.', 503);
    const pricing = await packPricing(umi, key, e.price);
    const catalog = table(e, c.paused);
    catalog.payment = { ...catalog.payment, amount: pricing.price.toString() };
    return { c, key, pricing, catalog };
  }
  return {
    async catalog() {
      const current = await live();
      return { ...current.catalog, priceRevision: current.pricing.revision.toString() };
    },
    async preparePrice(draft) {
      const current = await live();
      const price = decimalToUnits(draft.price, 6, 9_999_999_999_999_999n);
      if (draft.expectedVersion !== current.c.version || draft.expectedPrice !== current.pricing.price.toString()
        || draft.expectedRevision !== current.pricing.revision.toString()) throw new ShopError('Pack price or edition changed. Reload before changing it.', 409);
      if (price === draft.expectedPrice) throw new ShopError('The pack already has this price.');
      const admin = createNoopSigner(publicKey(adminAddress!));
      const keys = [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: await pda([utf('config')]), isSigner: false, isWritable: false },
        { pubkey: current.key, isSigner: false, isWritable: false },
        { pubkey: publicKey(current.pricing.key), isSigner: false, isWritable: true },
        ...(current.pricing.revision === 0n ? [{ pubkey: publicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }] : []),
      ];
      const [blockhash, balance] = await Promise.all([umi.rpc.getLatestBlockhash(), umi.rpc.getBalance(admin.publicKey)]);
      const tx = await transactionBuilder().setVersion(0).setFeePayer(admin).setBlockhash(blockhash).add({ instruction: {
        programId: publicKey(PACK_PROGRAM_ID), keys,
        data: editionPriceData(current.c.version, current.pricing.revision, current.pricing.price, BigInt(price)),
      }, signers: [admin], bytesCreatedOnChain: 0 }).buildAndSign(umi);
      const simulation = await umi.rpc.simulateTransaction(tx, { verifySignatures: false, accounts: [admin.publicKey] });
      if (simulation.err) throw new ShopError('Price update simulation failed. The pack program must be upgraded and the admin needs SOL. Nothing was submitted.', 409);
      const remaining = simulation.accounts?.[0]?.lamports;
      if (remaining === undefined || !Number.isSafeInteger(remaining) || balance.basisPoints < BigInt(remaining)) throw new ShopError('Could not estimate price update cost.', 503);
      return { edition: String(current.key), catalog: { ...current.catalog, payment: { ...current.catalog.payment, amount: price } },
        priceUpdate: { account: current.pricing.key, expectedPrice: draft.expectedPrice, expectedRevision: draft.expectedRevision,
          revision: (current.pricing.revision + 1n).toString() },
        transaction: Buffer.from(umi.transactions.serialize(tx)).toString('base64'), lastValidBlockHeight: blockhash.lastValidBlockHeight,
        networkFeeLamports: (balance.basisPoints - BigInt(remaining)).toString() };
    },
    async prepare(catalog) {
      const c = await root();
      if (catalog.version !== c.version + 1) throw new ShopError('The active edition changed. Reload before publishing.', 409);
      const currentKey = await editionKey(c.version);
      const current = decodeEdition(await account(currentKey));
      const price = await packPricing(umi, currentKey, current.price);
      if (catalog.payment.amount !== price.price.toString()) throw new ShopError('Pack price changed. Reload it before publishing new chances.', 409);
      for (const drop of catalog.drops) {
        const f = FIGURES.find(f => f.id === drop.figureId && f.purchasable && !f.seekerExclusive);
        if (!f) throw new ShopError('Pack contains an unsupported figure.');
        try { await verifyResources(f); }
        catch { throw new ShopError(`Published metadata/preview not ready for ${f.id}. Deploy the verified figure resources first.`, 409); }
      }
      const admin = createNoopSigner(publicKey(adminAddress!));
      const edition = await editionKey(catalog.version);
      const [blockhash, balance] = await Promise.all([umi.rpc.getLatestBlockhash(), umi.rpc.getBalance(admin.publicKey)]);
      const tx = await transactionBuilder().setVersion(0).setFeePayer(admin).setBlockhash(blockhash).add({ instruction: {
        programId: publicKey(PACK_PROGRAM_ID), keys: [
          { pubkey: admin.publicKey, isSigner: true, isWritable: true },
          { pubkey: await pda([utf('config')]), isSigner: false, isWritable: true },
          { pubkey: edition, isSigner: false, isWritable: true },
          { pubkey: publicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        ], data: publishEditionData(catalog.version, BigInt(catalog.payment.amount), catalog.drops.map(d => {
          const f = FIGURES.find(f => f.id === d.figureId)!;
          return { variant: f.variant, weight: d.weight, name: f.name, uri: `${config.publicOrigin}/figures/${f.id}.json` };
        })),
      }, signers: [admin], bytesCreatedOnChain: 0 }).buildAndSign(umi);
      const bytes = umi.transactions.serialize(tx);
      if (bytes.length > 1232) throw new ShopError('This edition exceeds the transaction size limit. Fewer drops or a program upgrade are required.', 409);
      const simulation = await umi.rpc.simulateTransaction(tx, { verifySignatures: false, accounts: [admin.publicKey] });
      if (simulation.err) throw new ShopError('Publication simulation failed. Check the admin SOL balance and active edition. Nothing was submitted.', 409);
      const remaining = simulation.accounts?.[0]?.lamports;
      if (remaining === undefined || !Number.isSafeInteger(remaining) || balance.basisPoints < BigInt(remaining)) throw new ShopError('Could not estimate publication cost.', 503);
      return { edition: String(edition), transaction: Buffer.from(bytes).toString('base64'), lastValidBlockHeight: blockhash.lastValidBlockHeight,
        networkFeeLamports: (balance.basisPoints - BigInt(remaining)).toString() };
    },
    validateSigned(job, signed) {
      const expected = decode(job.transaction); const actual = decode(signed);
      if (!Buffer.from(expected.serializedMessage).equals(Buffer.from(actual.serializedMessage)) || actual.message.header.numRequiredSignatures !== 1
        || actual.signatures.length !== 1 || actual.message.accounts[0] !== job.buyer || job.buyer !== adminAddress
        || !umi.eddsa.verify(actual.serializedMessage, actual.signatures[0]!, publicKey(job.buyer))) throw new ShopError('The publication message or administrator signature is invalid. Nothing was submitted.');
      return base58.deserialize(actual.signatures[0]!)[0];
    },
    async send(signed) { await umi.rpc.sendTransaction(decode(signed), { skipPreflight: false, maxRetries: 3, preflightCommitment: 'confirmed' }); },
    async status(job) {
      if (job.signature) {
        const [s] = await umi.rpc.getSignatureStatuses([base58.serialize(job.signature)], { searchTransactionHistory: true });
        if (s?.commitment === 'confirmed' || s?.commitment === 'finalized') return s.error ? 'failed' : 'confirmed';
        if (s) return 'submitted';
      }
      const height = await umi.rpc.call<number>('getBlockHeight', [{ commitment: 'finalized' }]);
      if (height <= job.lastValidBlockHeight) return job.signature ? 'submitted' : 'prepared';
      if (job.kind === 'price') {
        if (!job.priceUpdate) throw new ShopError('Invalid price update request.', 503);
        // Exact transaction proof survives further price changes and missing wallet replies.
        const history = await umi.rpc.call<Array<{ signature: string }>>('getSignaturesForAddress', [job.priceUpdate.account, { commitment: 'finalized', limit: 10 }]);
        const expected = decode(job.transaction);
        for (const entry of history) {
          const tx = await umi.rpc.getTransaction(base58.serialize(entry.signature), { commitment: 'finalized' });
          if (!tx) throw new ShopError('Price update requires reconciliation. Check again.', 503);
          if (Buffer.from(tx.serializedMessage).equals(Buffer.from(expected.serializedMessage))) return tx.meta.err ? 'failed' : 'confirmed';
        }
        if (history.length === 10) throw new ShopError('Price update history requires reconciliation. Do not sign a replacement.', 503);
        const e = decodeEdition(await account(job.edition, 'finalized'));
        const p = await packPricing(umi, job.edition, e.price, 'finalized');
        return p.revision.toString() !== job.priceUpdate.expectedRevision ? 'superseded' : 'expired';
      }
      // Recover a wallet that broadcast but failed to return the signature.
      const a = await umi.rpc.getAccount(publicKey(job.edition), { commitment: 'finalized' });
      if (!a.exists) {
        const current = decodeConfig(await account(await pda([utf('config')]), 'finalized'));
        if (current.version >= job.catalog.version) throw new ShopError('Publication reads are inconsistent. Check status again before preparing another edition.', 503);
        return 'expired';
      }
      if (a.owner !== publicKey(PACK_PROGRAM_ID)) throw new ShopError('Invalid edition owner.', 503);
      const e = table(decodeEdition(a.data), false);
      return e.version === job.catalog.version && e.payment.amount === job.catalog.payment.amount && JSON.stringify(e.drops) === JSON.stringify(job.catalog.drops) ? 'confirmed' : 'superseded';
    },
  };
}
