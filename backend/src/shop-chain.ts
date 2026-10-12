import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, generateSigner, keypairIdentity, lamports, publicKey, transactionBuilder, type Umi } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { createV1, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox, transferSol, setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import { validateFigureQuantity, type FigureId, type MintOrder, type TokenPayment } from '@rps/core/shop';
import { FIGURES, FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import type { ShopConfig } from './shop-config.js';
import { ShopError } from './shop-error.js';
import { shopTokenBalance, shopTokenPayment } from './shop-token-payment.js';
import { prepareSolFunding, verifySolFundingSimulation } from './shop-sol-funding.js';

export type ChainMint = Pick<MintOrder, 'asset' | 'assets' | 'transaction' | 'lastValidBlockHeight' | 'networkFeeLamports' | 'solFunding'>;
export interface ShopChain {
  prepare(figureId: FigureId, buyer: string, price: string, payment?: TokenPayment, paymentMode?: 'sol', quantity?: number): Promise<ChainMint>;
  validateSigned(order: Pick<MintOrder, 'transaction' | 'buyer'>, signed: string): string;
  send(signed: string): Promise<void>;
  status(order: MintOrder): Promise<'pending' | 'confirmed' | 'failed' | 'expired'>;
}

// Umi stays entirely on the server: neither private mint keys nor SDK legacy
// transaction types are shipped to the mobile or browser bundle.
export function createShopChain(config: ShopConfig, runtime?: Umi): ShopChain {
  const umi = (runtime ?? createUmi(config.rpcUrl, { commitment: 'confirmed', fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) })).use(mplCore()).use(mplToolbox());
  if (config.enabled) {
    const secret: unknown = JSON.parse(config.authoritySecret!);
    if (!Array.isArray(secret) || secret.length !== 64 || !secret.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('SHOP_MINT_AUTHORITY_SECRET must be a 64-byte JSON keypair');
    umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(secret))));
  }
  const decode = (encoded: string) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 1644) throw new ShopError('Invalid transaction');
    try { return umi.transactions.deserialize(Buffer.from(encoded, 'base64')); }
    catch { throw new ShopError('Invalid transaction'); }
  };
  return {
    async prepare(figureId, buyerAddress, price, paymentQuote, paymentMode, quantity = 1) {
      validateFigureQuantity(quantity);
      if (!config.enabled || !config.collection || !config.treasury) throw new Error('Minting is not available yet');
      const buyer = createNoopSigner(publicKey(buyerAddress));
      const tokenPayment = paymentQuote ?? FIGURE_TOKEN_PAYMENTS[figureId];
      const registered = FIGURE_TOKEN_PAYMENTS[figureId];
      if (paymentQuote && (!registered || paymentQuote.mint !== registered.mint || paymentQuote.decimals !== registered.decimals || paymentQuote.symbol !== registered.symbol || !/^[1-9]\d{0,19}$/.test(paymentQuote.amount) || BigInt(paymentQuote.amount) > 18_446_744_073_709_551_615n)) throw new ShopError('Invalid payment currency');
      if (tokenPayment && (config.cluster !== 'mainnet-beta' || price !== '0')) throw new ShopError('Invalid token purchase configuration');
      const [genesis, collection, balance, blockhash] = await Promise.all([
        umi.rpc.call<string>('getGenesisHash'),
        fetchCollection(umi, publicKey(config.collection)),
        umi.rpc.getBalance(buyer.publicKey),
        umi.rpc.getLatestBlockhash(),
      ]);
      const expectedGenesis = config.cluster === 'devnet'
        ? 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
        : '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
      if (genesis !== expectedGenesis) throw new Error('Shop RPC network does not match configuration');
      if (collection.updateAuthority !== umi.identity.publicKey) throw new Error('Invalid shop collection authority');
      const figure = FIGURES.find(candidate => candidate.id === figureId)!;
      const assets = Array.from({ length: quantity }, () => generateSigner(umi));
      const asset = assets[0]!;
      if (paymentMode && !tokenPayment) throw new ShopError('Buy with SOL is only available for token-priced figures.');
      const tokenBalance = paymentMode && tokenPayment ? (await shopTokenBalance(umi, buyer, tokenPayment)).amount : 0n;
      const protectedAccounts = [String(umi.identity.publicKey), config.collection, config.treasury, ...assets.map(a => String(a.publicKey))];
      let funding = paymentMode && tokenPayment ? await prepareSolFunding(umi, buyer, tokenPayment,
        tokenBalance, config.jupiterApiKey, protectedAccounts) : null;
      const payment = tokenPayment
        ? await shopTokenPayment(umi, buyer, config.treasury, tokenPayment, Boolean(funding))
        : transferSol(umi, { source: buyer, destination: publicKey(config.treasury), amount: lamports(BigInt(price)) });
      const compose = () => transactionBuilder()
        .setVersion(0).setFeePayer(buyer).setBlockhash(blockhash)
        .setAddressLookupTables(funding?.lookups ?? [])
        .add(funding ? setComputeUnitLimit(umi, { units: 1_400_000 }).add(setComputeUnitPrice(umi, { microLamports: 10_000 })) : quantity > 1 ? setComputeUnitLimit(umi, { units: 600_000 }) : transactionBuilder())
        .add(funding?.before ?? transactionBuilder())
        .add(payment)
        .add(assets.reduce((builder, nextAsset) => builder.add(createV1(umi, {
          asset: nextAsset, payer: buyer, owner: buyer.publicKey, authority: umi.identity,
          collection: collection.publicKey, name: figure.name,
          uri: `${config.publicOrigin}/figures/${figureId}.json`,
        })), transactionBuilder())).add(funding?.after ?? transactionBuilder());
      let builder = compose();
      for (const maxAccounts of [16, 12] as const) {
        if (!funding || builder.fitsInOneTransaction(umi)) break;
        funding = await prepareSolFunding(umi, buyer, tokenPayment!, tokenBalance, config.jupiterApiKey, protectedAccounts, fetch, maxAccounts);
        builder = compose();
      }
      if (!builder.fitsInOneTransaction(umi)) throw new ShopError(quantity > 1 ? 'This purchase is too large. Choose fewer figures, or add the required tokens to your account.' : 'This exchange cannot fit with the purchase. Add the required tokens to your account instead.');
      const expiry = funding ? await umi.rpc.getLatestBlockhash() : blockhash;
      const currentBalance = funding ? await umi.rpc.getBalance(buyer.publicKey) : balance;
      builder = builder.setBlockhash(expiry);
      const transaction = await builder.buildAndSign(umi);
      const simulation = await umi.rpc.simulateTransaction(transaction, { verifySignatures: false, accounts: [buyer.publicKey, ...(funding ? [publicKey(funding.outputAccount), publicKey(funding.wrappedAccount)] : [])] });
      if (simulation.err) {
        if (currentBalance.basisPoints < BigInt(price) + BigInt(funding?.receipt.inputLamports ?? '0') + 10_000_000n) throw new ShopError(funding ? 'Not enough SOL to cover this purchase and additional fees.' : tokenPayment ? 'Add SOL for the additional fees, then try again.' : 'Add SOL to your wallet for the figure and network fees, then try again.');
        throw new ShopError('The mint could not be simulated. No payment was sent. Try again later.', 503);
      }
      if (funding) verifySolFundingSimulation(funding, tokenPayment!, buyerAddress, simulation);
      const remaining = simulation.accounts?.[0]?.lamports;
      if (remaining === undefined || !Number.isSafeInteger(remaining)) throw new Error('Unable to estimate mint fees');
      const fee = currentBalance.basisPoints - BigInt(remaining) - BigInt(price) - BigInt(funding?.receipt.inputLamports ?? '0');
      if (fee < 0n) throw new Error('Unable to estimate mint fees');
      if (funding && fee > 100_000_000n) throw new ShopError('Additional fees exceed the SOL purchase limit. No payment was sent.');
      return {
        asset: String(asset.publicKey), transaction: Buffer.from(umi.transactions.serialize(transaction)).toString('base64'),
        ...(quantity > 1 ? { assets: assets.map(a => String(a.publicKey)) } : {}),
        lastValidBlockHeight: expiry.lastValidBlockHeight, networkFeeLamports: fee.toString(), ...(funding ? { solFunding: funding.receipt } : {}),
      };
    },
    validateSigned(order, encoded) {
      const expected = decode(order.transaction);
      const actual = decode(encoded);
      if (!Buffer.from(expected.serializedMessage).equals(Buffer.from(actual.serializedMessage))) throw new ShopError('The wallet changed the purchase transaction. Nothing was submitted.');
      const signerCount = actual.message.header.numRequiredSignatures;
      if (actual.message.accounts[0] !== order.buyer || actual.signatures.length !== signerCount) throw new ShopError('Invalid purchase signer');
      for (let index = 0; index < signerCount; index++) {
        const signature = actual.signatures[index];
        const signer = actual.message.accounts[index];
        if (!signature || !signer || !umi.eddsa.verify(actual.serializedMessage, signature, signer)) throw new ShopError('The purchase is missing a valid signature');
      }
      return base58.deserialize(actual.signatures[0]!)[0];
    },
    async send(encoded) {
      await umi.rpc.sendTransaction(decode(encoded), { skipPreflight: false, maxRetries: 3, preflightCommitment: 'confirmed' });
    },
    async status(order) {
      if (order.signature) {
        const [status] = await umi.rpc.getSignatureStatuses([base58.serialize(order.signature)], { searchTransactionHistory: true });
        // A processed observation is not enough to report success or failure.
        if (status?.commitment === 'confirmed' || status?.commitment === 'finalized') return status.error ? 'failed' : 'confirmed';
        if (status) return 'pending';
      }
      // Only declare expiry after finalized block height passes the blockhash
      // lifetime. An ambiguous RPC error must never unlock another payment.
      const height = await umi.rpc.call<number>('getBlockHeight', [{ commitment: 'finalized' }]);
      if (height <= order.lastValidBlockHeight) return 'pending';
      // A wallet may broadcast before returning its signature to the app. After
      // expiry, recover that exact message via the unique asset address. Do not
      // mistake an unrelated transfer to the address for a successful mint.
      const history = await umi.rpc.call<Array<{ signature: string }>>('getSignaturesForAddress', [order.asset, { commitment: 'finalized', limit: 10 }]);
      const expected = decode(order.transaction);
      const transactions = await Promise.all(history.map(item => umi.rpc.getTransaction(base58.serialize(item.signature), { commitment: 'finalized' })));
      for (let index = 0; index < transactions.length; index++) {
        const transaction = transactions[index];
        if (transaction && Buffer.from(transaction.serializedMessage).equals(Buffer.from(expected.serializedMessage))) {
          order.signature = history[index]!.signature;
          return transaction.meta.err ? 'failed' : 'confirmed';
        }
      }
      if (transactions.some(transaction => !transaction) || history.length === 10) throw new Error('Purchase history requires reconciliation');
      return 'expired';
    },
  };
}
