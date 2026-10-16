import { createHash, createHmac } from 'node:crypto';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, createSignerFromKeypair, keypairIdentity, publicKey, transactionBuilder, type Umi, type Transaction } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { createV1, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox, setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import type { PackCatalog, PackOrder } from '@rps/core/packs';
import type { ShopConfig } from './shop-config.js';
import { createShopChain } from './shop-chain.js';
import { shopTokenBalance, shopTokenPayment } from './shop-token-payment.js';
import { prepareSolFunding, verifySolFundingSimulation } from './shop-sol-funding.js';
import { ShopError } from './shop-error.js';

export interface PackReward { figureId: string; name: string; uri: string }
export interface PackDelivery { transaction: string; signature: string; lastValidBlockHeight: number }
export type BackendPackQuote = Omit<PackOrder, 'id' | 'createdAt' | 'status' | 'signature' | 'result' | 'randomness'>;
export interface BackendPackChain {
  prepare(buyer: string, id: string, nonce: string, catalog: PackCatalog, paymentMode?: 'sol'): Promise<BackendPackQuote>;
  validateSigned(order: PackOrder, transaction: string): string;
  send(transaction: string): Promise<void>;
  paymentStatus(order: PackOrder): Promise<{ status: 'pending' | 'paid' | 'failed' | 'expired'; signature: string | null }>;
  prepareDelivery(order: PackOrder, nonce: string, reward: PackReward): Promise<PackDelivery>;
  deliveryStatus(order: PackOrder, delivery: PackDelivery): Promise<'pending' | 'confirmed' | 'failed' | 'expired'>;
}

/** Standard SPL payment, then server-paid Core delivery. No RIPSY program/VRF. */
export function createBackendPackChain(config: ShopConfig, runtime?: Umi): BackendPackChain {
  const umi = (runtime ?? createUmi(config.rpcUrl, { commitment: 'confirmed',
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) })).use(mplCore()).use(mplToolbox());
  if (config.enabled && config.authoritySecret) umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(config.authoritySecret)))));
  const verifier = createShopChain(config, umi);
  const decode = (value: string) => umi.transactions.deserialize(Buffer.from(value, 'base64'));
  const encode = (tx: Transaction) => Buffer.from(umi.transactions.serialize(tx)).toString('base64');
  const key = (nonce: string, label: string) => {
    if (!/^[a-f0-9]{64}$/.test(nonce)) throw new Error('Invalid private pack seed');
    return createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(createHmac('sha256', Buffer.from(nonce, 'hex')).update(label).digest()));
  };
  async function collection() {
    if (!config.enabled || config.cluster !== 'mainnet-beta' || !config.collection || !config.treasury) throw new ShopError('Packs are not available yet.', 503);
    const [genesis, value] = await Promise.all([umi.rpc.call<string>('getGenesisHash'), fetchCollection(umi, publicKey(config.collection))]);
    if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' || value.updateAuthority !== umi.identity.publicKey)
      throw new ShopError('Pack delivery is temporarily unavailable. No payment was sent.', 503);
    return value;
  }
  async function settled(encoded: string, signature: string | null, marker: string, lastValidBlockHeight: number) {
    const expected = decode(encoded);
    const inspect = async (candidate: string) => {
      const actual = await umi.rpc.getTransaction(base58.serialize(candidate), { commitment: 'finalized' });
      if (!actual) throw new ShopError('Your purchase is still being checked. Please check again shortly.', 503);
      if (!Buffer.from(actual.serializedMessage).equals(Buffer.from(expected.serializedMessage))) return null;
      return { signature: candidate, transaction: actual, status: actual.meta.err ? 'failed' as const : 'confirmed' as const };
    };
    if (signature) {
      const [status] = await umi.rpc.getSignatureStatuses([base58.serialize(signature)], { searchTransactionHistory: true });
      if (status?.commitment === 'finalized') {
        const found = await inspect(signature);
        if (!found) throw new ShopError('Purchase verification needs attention.', 503);
        return found;
      }
      if (status) return { status: 'pending' as const, signature };
    }
    // Also recover wallets which broadcast before the app receives a signature.
    // The unique, server-signed Memo marker creates no account and costs no rent.
    const history = await umi.rpc.call<Array<{ signature: string }>>('getSignaturesForAddress', [marker, { commitment: 'finalized', limit: 10 }]);
    if (!Array.isArray(history) || history.length >= 10) throw new ShopError('Purchase history is still being checked.', 503);
    for (const entry of history) { const found = await inspect(entry.signature); if (found) return found; }
    const height = await umi.rpc.call<number>('getBlockHeight', [{ commitment: 'finalized' }]);
    if (!Number.isSafeInteger(height)) throw new ShopError('Purchase status is temporarily unavailable.', 503);
    return { status: height > lastValidBlockHeight ? 'expired' as const : 'pending' as const, signature };
  }
  return {
    async prepare(buyerAddress, id, nonce, catalog, paymentMode) {
      const c = await collection();
      if ([config.treasury, config.collection, String(umi.identity.publicKey)].includes(buyerAddress)) throw new ShopError('Use a customer account for this purchase.');
      if ((await umi.rpc.getBalance(umi.identity.publicKey)).basisPoints < 5_000_000n)
        throw new ShopError('Pack delivery is temporarily unavailable. No payment was sent.', 503);
      const buyer = createNoopSigner(publicKey(buyerAddress));
      const marker = key(nonce, 'ripsy-pack-payment-v1'), asset = key(nonce, 'ripsy-pack-asset-v1');
      const protectedAccounts = [String(umi.identity.publicKey), config.treasury!, c.publicKey, String(marker.publicKey), String(asset.publicKey)];
      const tokenBalance = await shopTokenBalance(umi, buyer, catalog.payment);
      let funding = paymentMode ? await prepareSolFunding(umi, buyer, catalog.payment, tokenBalance.amount, config.jupiterApiKey, protectedAccounts) : null;
      const payment = await shopTokenPayment(umi, buyer, config.treasury!, catalog.payment, Boolean(funding));
      const blockhash = await umi.rpc.getLatestBlockhash();
      const compose = () => transactionBuilder().setVersion(0).setFeePayer(buyer).setBlockhash(blockhash)
        .setAddressLookupTables(funding?.lookups ?? [])
        .add(setComputeUnitLimit(umi, { units: funding ? 1_400_000 : 150_000 }))
        .add(funding ? setComputeUnitPrice(umi, { microLamports: 10_000 }) : transactionBuilder())
        .add(funding?.before ?? transactionBuilder()).add(payment)
        .add({ instruction: { programId: publicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
          keys: [{ pubkey: marker.publicKey, isWritable: false, isSigner: true }], data: new TextEncoder().encode(`RIPSY pack ${id}`) }, signers: [marker], bytesCreatedOnChain: 0 })
        .add(funding?.after ?? transactionBuilder());
      let builder = compose();
      for (const maxAccounts of [16, 12] as const) {
        if (!funding || builder.fitsInOneTransaction(umi)) break;
        funding = await prepareSolFunding(umi, buyer, catalog.payment, tokenBalance.amount, config.jupiterApiKey, protectedAccounts, fetch, maxAccounts);
        builder = compose();
      }
      if (!builder.fitsInOneTransaction(umi)) throw new ShopError('This exchange cannot fit with the purchase. Add SKR to your account instead.');
      const expiry = await umi.rpc.getLatestBlockhash();
      const balance = await umi.rpc.getBalance(buyer.publicKey);
      const tx = await builder.setBlockhash(expiry).buildAndSign(umi);
      const simulation = await umi.rpc.simulateTransaction(tx, { verifySignatures: false,
        accounts: [buyer.publicKey, ...(funding ? [publicKey(funding.outputAccount), publicKey(funding.wrappedAccount)] : [])] });
      if (simulation.err) throw new ShopError('Could not prepare this pack. Check your balance and try again. No payment was sent.', 503);
      if (funding) verifySolFundingSimulation(funding, catalog.payment, buyerAddress, simulation);
      const remaining = simulation.accounts?.[0]?.lamports;
      if (!Number.isSafeInteger(remaining)) throw new ShopError('Could not estimate pack fees. No payment was sent.', 503);
      const fee = balance.basisPoints - BigInt(remaining!) - BigInt(funding?.receipt.inputLamports ?? '0');
      if (fee < 0n || fee > 100_000_000n) throw new ShopError('Could not verify pack fees. No payment was sent.', 503);
      return { engine: 'backend', buyer: buyerAddress, cluster: 'mainnet-beta', transaction: encode(tx),
        receipt: String(marker.publicKey), asset: String(asset.publicKey),
        // Compatibility field only: settings fingerprint, not an onchain PDA.
        edition: base58.deserialize(createHash('sha256').update(JSON.stringify(catalog)).digest())[0],
        version: catalog.version, payment: catalog.payment, drops: catalog.drops,
        networkFeeLamports: fee.toString(), lastValidBlockHeight: expiry.lastValidBlockHeight,
        ...(funding ? { solFunding: funding.receipt } : {}) };
    },
    validateSigned: (order, signed) => verifier.validateSigned(order, signed),
    send: signed => verifier.send(signed),
    async paymentStatus(order) {
      const value = await settled(order.transaction, order.signature, order.receipt, order.lastValidBlockHeight);
      if (value.status !== 'confirmed') return { status: value.status, signature: value.signature };
      const meta = value.transaction!.meta;
      const credit = meta.postTokenBalances.filter(b => String(b.owner) === config.treasury && String(b.mint) === order.payment.mint)
        .reduce((sum, post) => sum + post.amount.basisPoints - (meta.preTokenBalances.find(pre => pre.accountIndex === post.accountIndex && pre.mint === post.mint)?.amount.basisPoints ?? 0n), 0n);
      if (credit !== BigInt(order.payment.amount)) throw new ShopError('Pack payment verification needs attention. Do not purchase again.', 503);
      return { status: 'paid', signature: value.signature };
    },
    async prepareDelivery(order, nonce, reward) {
      const c = await collection();
      const asset = key(nonce, 'ripsy-pack-asset-v1');
      if (String(asset.publicKey) !== order.asset || reward.figureId !== order.result) throw new Error('Saved pack delivery mismatch');
      const blockhash = await umi.rpc.getLatestBlockhash();
      const tx = await transactionBuilder().setVersion(0).setFeePayer(umi.identity).setBlockhash(blockhash)
        .add(setComputeUnitLimit(umi, { units: 250_000 }))
        .add(createV1(umi, { asset, payer: umi.identity, owner: publicKey(order.buyer), authority: umi.identity,
          collection: c.publicKey, name: reward.name, uri: reward.uri })).buildAndSign(umi);
      const simulation = await umi.rpc.simulateTransaction(tx, { verifySignatures: true });
      if (simulation.err) throw new ShopError('Your pack result is saved. Delivery is delayed; check again shortly.', 503);
      return { transaction: encode(tx), signature: base58.deserialize(tx.signatures[0]!)[0], lastValidBlockHeight: blockhash.lastValidBlockHeight };
    },
    async deliveryStatus(order, delivery) {
      const value = await settled(delivery.transaction, delivery.signature, order.asset, delivery.lastValidBlockHeight);
      return value.status;
    },
  };
}
