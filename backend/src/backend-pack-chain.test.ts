import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, lamports, publicKey, type RpcInterface, type TransactionWithMeta } from '@metaplex-foundation/umi';
import { Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getCollectionV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/collectionV1AccountData.js';
import { findAssociatedTokenPda, getMintAccountDataSerializer, getTokenAccountDataSerializer, mplToolbox, TokenState } from '@metaplex-foundation/mpl-toolbox';
import { PACK_PROGRAM_ID, type PackOrder } from '@rps/core/packs';
import { createBackendPackChain } from './backend-pack-chain.js';
import { DEFAULT_BACKEND_PACK } from './backend-pack-settings.js';
import { loadShopConfig } from './shop-config.js';
import { SHOP_TOKEN_PROGRAM } from './shop-token-payment.js';
import { JUPITER, WSOL } from './shop-sol-funding.js';

function fixture() {
  const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
  const authority = generateSigner(umi), buyer = generateSigner(umi), collection = generateSigner(umi).publicKey, treasury = generateSigner(umi).publicKey;
  const config = { ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta' as const, collection, treasury, jupiterApiKey: 'test-only-key',
    authoritySecret: JSON.stringify(Array.from(authority.secretKey)) };
  const collectionData = () => getCollectionV1AccountDataSerializer().serialize({ key: Key.CollectionV1,
    updateAuthority: authority.publicKey, name: 'RIPSY', uri: 'https://www.ripsy.fun', numMinted: 0, currentSize: 0 });
  const mint = publicKey(DEFAULT_BACKEND_PACK.payment.mint);
  const [source] = findAssociatedTokenPda(umi, { mint, owner: buyer.publicKey });
  let tokenBalance = 100_000_000n, mintDecimals = 6, deliveryBalance = 10_000_000n;
  umi.rpc.getAccount = async key => {
    const data = key === collection ? collectionData() : key === mint
      ? getMintAccountDataSerializer().serialize({ mintAuthority: null, supply: 1_000_000_000n, decimals: mintDecimals, isInitialized: true, freezeAuthority: null })
      : key === source ? getTokenAccountDataSerializer().serialize({ mint, owner: buyer.publicKey, amount: tokenBalance,
        delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null }) : null;
    return data ? { exists: true, publicKey: key, owner: key === collection ? MPL_CORE_PROGRAM_ID : SHOP_TOKEN_PROGRAM,
      lamports: lamports(1000000), executable: false, data } : { exists: false, publicKey: key };
  };
  umi.rpc.getBalance = async key => lamports(key === authority.publicKey ? deliveryBalance : 100_000_000n);
  umi.rpc.getLatestBlockhash = async () => ({ blockhash: publicKey('11111111111111111111111111111111'), lastValidBlockHeight: 100 });
  umi.rpc.simulateTransaction = (async () => ({ err: null, logs: [], accounts: [{ lamports: 99_000_000 }] })) as unknown as RpcInterface['simulateTransaction'];
  let commitment: 'confirmed' | 'finalized' | null = null, height = 90, history: string[] = [], confirmed: TransactionWithMeta | null = null;
  umi.rpc.getSignatureStatuses = (async () => [commitment ? { commitment, error: null } : null]) as RpcInterface['getSignatureStatuses'];
  umi.rpc.getTransaction = (async () => confirmed) as RpcInterface['getTransaction'];
  umi.rpc.call = (async method => method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
    : method === 'getBlockHeight' ? height : method === 'getSignaturesForAddress' ? history.map(signature => ({ signature })) : undefined) as RpcInterface['call'];
  const chain = createBackendPackChain(config, umi);
  const nonce = '07'.repeat(32);
  async function prepare() {
    return { ...await chain.prepare(buyer.publicKey, 'a'.repeat(64), nonce, DEFAULT_BACKEND_PACK), id: 'a'.repeat(64),
      status: 'prepared', signature: null, result: null, randomness: null, createdAt: 1 } as PackOrder;
  }
  async function sign(order: PackOrder) {
    const tx = umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
    tx.signatures[0] = await umi.eddsa.sign(tx.serializedMessage, buyer);
    return Buffer.from(umi.transactions.serialize(tx)).toString('base64');
  }
  function finalize(encoded: string, credited = 10_000_000n) {
    const tx = umi.transactions.deserialize(Buffer.from(encoded, 'base64'));
    confirmed = { ...tx, slot: 1, blockTime: null, meta: { err: null, fee: lamports(10000), logs: [], preBalances: [], postBalances: [],
      preTokenBalances: [], postTokenBalances: [{ accountIndex: 1, mint, owner: treasury, amount: { basisPoints: credited, decimals: 6, identifier: 'SKR' } }],
      innerInstructions: null, loadedAddresses: { writable: [], readonly: [] }, computeUnitsConsumed: 10000n, costUnits: null } } as TransactionWithMeta;
    commitment = 'finalized';
  }
  return { umi, chain, config, buyer, authority, treasury, collection, prepare, sign, finalize, nonce,
    setCommitment(value: typeof commitment) { commitment = value; }, setHeight(value: number) { height = value; },
    setHistory(value: string[]) { history = value; }, setTokenBalance(value: bigint) { tokenBalance = value; },
    setMintDecimals(value: number) { mintDecimals = value; }, setDeliveryBalance(value: bigint) { deliveryBalance = value; } };
}

test('pack payment uses only standard SPL/Memo instructions, a fixed price and unique rent-free marker', async () => {
  const f = fixture(); const order = await f.prepare();
  const tx = f.umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
  assert.equal(order.engine, 'backend'); assert.equal(order.payment.amount, '10000000'); assert.notEqual(order.receipt, order.asset);
  const programs = tx.message.instructions.map(ix => String(tx.message.accounts[ix.programIndex]));
  assert.ok(programs.includes(SHOP_TOKEN_PROGRAM)); assert.ok(programs.includes('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'));
  assert.ok(!programs.includes(PACK_PROGRAM_ID)); assert.ok(!programs.includes(MPL_CORE_PROGRAM_ID));
  assert.ok(!programs.includes('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'));
  assert.ok(!Buffer.from(tx.serializedMessage).includes(Buffer.from('/figures/')));
  const memo = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')!;
  assert.equal(tx.message.accounts[memo.accountIndexes[0]!], order.receipt);
  assert.ok(tx.message.accounts.indexOf(publicKey(order.receipt)) < tx.message.header.numRequiredSignatures);
  assert.equal(order.networkFeeLamports, '1000000');
  assert.equal(order.result, null); assert.equal(order.randomness, null);
});
test('buyer approval must preserve the exact prepared payment and its server marker signature', async () => {
  const f = fixture(); const order = await f.prepare(); const signed = await f.sign(order);
  assert.ok(f.chain.validateSigned(order, signed));
  assert.throws(() => f.chain.validateSigned(order, order.transaction), /signature/);
  const tx = f.umi.transactions.deserialize(Buffer.from(signed, 'base64'));
  tx.signatures[1] = new Uint8Array(64);
  assert.throws(() => f.chain.validateSigned(order, Buffer.from(f.umi.transactions.serialize(tx)).toString('base64')), /signature/);
  const other = await f.prepare(); other.transaction = signed;
  const different = f.umi.transactions.deserialize(Buffer.from(signed, 'base64'));
  different.serializedMessage[10] = different.serializedMessage[10]! ^ 1;
  assert.throws(() => f.chain.validateSigned(order, Buffer.from(f.umi.transactions.serialize(different)).toString('base64')));
});
test('only finalized exact-message payments with the full SKR treasury credit can resolve a pack', async () => {
  const f = fixture(); const order = await f.prepare(), signed = await f.sign(order);
  order.signature = f.chain.validateSigned(order, signed);
  f.setCommitment('confirmed'); assert.equal((await f.chain.paymentStatus(order)).status, 'pending');
  f.finalize(signed, 9_999_999n); await assert.rejects(() => f.chain.paymentStatus(order), /verification/);
  f.finalize(signed); assert.equal((await f.chain.paymentStatus(order)).status, 'paid');
  const wrong = await f.prepare(); wrong.transaction = Buffer.from('different').toString('base64');
  await assert.rejects(() => f.chain.paymentStatus(wrong));
});
test('wallet-broadcast payments recover by unique marker; expiry requires finalized negative evidence', async () => {
  const f = fixture(); const order = await f.prepare();
  assert.equal((await f.chain.paymentStatus(order)).status, 'pending');
  f.setHeight(101); assert.equal((await f.chain.paymentStatus(order)).status, 'expired');
  const signed = await f.sign(order); f.finalize(signed); f.setCommitment(null);
  const signature = f.chain.validateSigned(order, signed); f.setHistory([signature]);
  assert.deepEqual(await f.chain.paymentStatus(order), { status: 'paid', signature });
  f.setHistory(Array(10).fill(signature)); await assert.rejects(() => f.chain.paymentStatus(order), /history/);
});
test('delivery is server-paid Core creation to the buyer and uses one stable asset across retries', async () => {
  const f = fixture(); const order = await f.prepare();
  order.result = 'ore'; order.randomness = 'ab'.repeat(32); order.status = 'ready-to-claim';
  const reward = { figureId: 'ore', name: 'ORE', uri: 'https://www.ripsy.fun/figures/ore.json' };
  const first = await f.chain.prepareDelivery(order, f.nonce, reward), second = await f.chain.prepareDelivery(order, f.nonce, reward);
  assert.equal(first.transaction, second.transaction);
  const tx = f.umi.transactions.deserialize(Buffer.from(first.transaction, 'base64'));
  assert.equal(tx.message.accounts[0], f.authority.publicKey);
  assert.ok(tx.message.accounts.includes(publicKey(order.asset)));
  assert.ok(tx.message.accounts.indexOf(f.buyer.publicKey) >= tx.message.header.numRequiredSignatures);
  assert.ok(Buffer.from(tx.serializedMessage).includes(Buffer.from(reward.uri)));
  assert.ok(!tx.message.accounts.includes(publicKey(PACK_PROGRAM_ID)));
  await assert.rejects(() => f.chain.prepareDelivery(order, '08'.repeat(32), reward), /mismatch/);
  await assert.rejects(() => f.chain.prepareDelivery(order, f.nonce, { ...reward, figureId: 'jup' }), /mismatch/);
  f.finalize(first.transaction); assert.equal(await f.chain.deliveryStatus(order, first), 'confirmed');
});
test('payment rejects insufficient SKR, altered mint precision and depleted delivery funds before charging', async () => {
  const f = fixture(); f.setTokenBalance(0n);
  await assert.rejects(() => f.prepare(), /Not enough SKR/);
  f.setTokenBalance(100_000_000n); f.setMintDecimals(9);
  await assert.rejects(() => f.prepare(), /currency/);
  f.setMintDecimals(6); f.setDeliveryBalance(1n);
  await assert.rejects(() => f.prepare(), /delivery/);
  await assert.rejects(() => f.chain.prepare(f.treasury, 'a'.repeat(64), f.nonce, DEFAULT_BACKEND_PACK), /customer/);
});
test('Buy with SOL composes a validated exchange and exact SKR payment without revealing a result', async () => {
  const f = fixture(); f.setTokenBalance(250000n);
  const mint = publicKey(DEFAULT_BACKEND_PACK.payment.mint);
  const wrapped = findAssociatedTokenPda(f.umi, { owner: f.buyer.publicKey, mint: WSOL })[0];
  const output = findAssociatedTokenPda(f.umi, { owner: f.buyer.publicKey, mint })[0];
  f.umi.rpc.getAccounts = async keys => Promise.all(keys.map(key => f.umi.rpc.getAccount(key)));
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'test-only-key');
    const amount = BigInt(new URL(String(url)).searchParams.get('amount')!);
    const data = Buffer.alloc(39); createHash('sha256').update('global:route_v2').digest().copy(data, 0, 0, 8);
    data.writeBigUInt64LE(amount, 8); data.writeBigUInt64LE(amount * 100n, 16); data.writeUInt16LE(50, 24);
    data.writeUInt32LE(1, 30); data.writeUInt16LE(10000, 35); data[38] = 1;
    return new Response(JSON.stringify({ inputMint: WSOL, outputMint: mint, inAmount: String(amount), outAmount: String(amount * 100n),
      otherAmountThreshold: String(amount * 100n * 995n / 1000n), swapMode: 'ExactIn', slippageBps: 50,
      setupInstructions: [], otherInstructions: [], cleanupInstruction: null, addressesByLookupTableAddress: {},
      swapInstruction: { programId: JUPITER, data: data.toString('base64'), accounts: [
        { pubkey: f.buyer.publicKey, isSigner: true, isWritable: false }, { pubkey: wrapped, isSigner: false, isWritable: true },
        { pubkey: output, isSigner: false, isWritable: true }, { pubkey: WSOL, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: SHOP_TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SHOP_TOKEN_PROGRAM, isSigner: false, isWritable: false }, { pubkey: output, isSigner: false, isWritable: true },
      ] } }));
  };
  f.umi.rpc.simulateTransaction = (async tx => {
    const ix = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === '11111111111111111111111111111111')!;
    const input = Buffer.from(ix.data).readBigUInt64LE(4);
    const remaining = 250000n + input * 100n * 995n / 1000n - 10000000n;
    const data = getTokenAccountDataSerializer().serialize({ mint, owner: f.buyer.publicKey, amount: remaining, delegate: null,
      state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null });
    return { err: null, logs: [], accounts: [{ lamports: Number(100000000n - input - 1000000n) },
      { executable: false, owner: SHOP_TOKEN_PROGRAM, lamports: 2039280, data: [Buffer.from(data).toString('base64'), 'base64'] }, null] };
  }) as RpcInterface['simulateTransaction'];
  try {
    const order = await f.chain.prepare(f.buyer.publicKey, 'a'.repeat(64), f.nonce, DEFAULT_BACKEND_PACK, 'sol');
    const tx = f.umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
    assert.ok(Buffer.from(order.transaction, 'base64').length <= 1232);
    assert.equal(order.solFunding?.shortfall, '9750000'); assert.equal(order.networkFeeLamports, '1000000');
    const swap = tx.message.instructions.findIndex(ix => tx.message.accounts[ix.programIndex] === JUPITER);
    const payment = tx.message.instructions.findIndex(ix => tx.message.accounts[ix.programIndex] === SHOP_TOKEN_PROGRAM && ix.data[0] === 12);
    assert.ok(swap >= 0 && payment > swap);
    assert.equal(Buffer.from(tx.message.instructions[payment]!.data).readBigUInt64LE(1), 10000000n);
    assert.ok(!tx.message.accounts.includes(publicKey(PACK_PROGRAM_ID))); assert.ok(!tx.message.accounts.includes(MPL_CORE_PROGRAM_ID));
    assert.ok(f.chain.validateSigned(order as PackOrder, await f.sign(order as PackOrder)));
  } finally { globalThis.fetch = original; }
});
