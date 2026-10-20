import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, lamports, publicKey, type RpcInterface, type TransactionWithMeta } from '@metaplex-foundation/umi';
import { Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getCollectionV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/collectionV1AccountData.js';
import { getAssetV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/assetV1AccountData.js';
import { findAssociatedTokenPda, getMintAccountDataSerializer, getTokenAccountDataSerializer, mplToolbox, TokenState } from '@metaplex-foundation/mpl-toolbox';
import { PACK_PROGRAM_ID, type PackOrder } from '@rps/core/packs';
import { createBackendPackChain } from './backend-pack-chain.js';
import { DEFAULT_BACKEND_PACK } from './backend-pack-settings.js';
import { loadShopConfig } from './shop-config.js';
import { SHOP_TOKEN_PROGRAM } from './shop-token-payment.js';
import { JUPITER, WSOL } from './shop-sol-funding.js';
import { CORE_CREATE_FEE, packDeliveryAssetSize } from './backend-pack-delivery-funding.js';

function fixture() {
  const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
  const authority = generateSigner(umi), buyer = generateSigner(umi), collection = generateSigner(umi).publicKey, treasury = generateSigner(umi).publicKey;
  const config = { ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta' as const, collection, treasury, jupiterApiKey: 'test-only-key',
    authoritySecret: JSON.stringify(Array.from(authority.secretKey)) };
  const collectionData = () => getCollectionV1AccountDataSerializer().serialize({ key: Key.CollectionV1,
    updateAuthority: authority.publicKey, name: 'RIPSY', uri: 'https://www.ripsy.fun', numMinted: 0, currentSize: 0 });
  const mint = publicKey(DEFAULT_BACKEND_PACK.payment.mint);
  const rewards = DEFAULT_BACKEND_PACK.drops.map(drop => ({ figureId: drop.figureId, name: drop.figureId === 'bonk' ? 'BONK' : drop.figureId === 'ore' ? 'ORE' : 'Jup', uri: `https://www.ripsy.fun/figures/${drop.figureId}.json` }));
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
  umi.rpc.getRent = async bytes => lamports(890960n + BigInt(bytes) * 3040n);
  let protocolFee = 1500000n, networkFee: number | null = 10000;
  const probe = (tx: Parameters<RpcInterface['simulateTransaction']>[0]) => {
    const ix = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === MPL_CORE_PROGRAM_ID)!;
    const reward = rewards.find(r => Buffer.from(ix.data).includes(Buffer.from(r.uri)))!;
    const data = getAssetV1AccountDataSerializer().serialize({ key: Key.AssetV1, owner: buyer.publicKey,
      updateAuthority: { __kind: 'Collection', fields: [collection] }, name: reward.name, uri: reward.uri, seq: null });
    return { err: null, logs: [], accounts: [{ owner: MPL_CORE_PROGRAM_ID, executable: false, lamports: Number(890960n + BigInt(data.length) * 3040n + protocolFee),
      data: [Buffer.from(data).toString('base64'), 'base64'] }] };
  };
  const defaultSimulation = (async (tx: Parameters<RpcInterface['simulateTransaction']>[0]) => tx.message.instructions.some(ix => tx.message.accounts[ix.programIndex] === MPL_CORE_PROGRAM_ID)
    ? probe(tx) : { err: null, logs: [], accounts: [{ lamports: 96_240_320 }] }) as unknown as RpcInterface['simulateTransaction'];
  umi.rpc.simulateTransaction = defaultSimulation;
  let commitment: 'confirmed' | 'finalized' | null = null, height = 90, history: string[] = [], confirmed: TransactionWithMeta | null = null;
  umi.rpc.getSignatureStatuses = (async () => [commitment ? { commitment, error: null } : null]) as RpcInterface['getSignatureStatuses'];
  umi.rpc.getTransaction = (async () => confirmed) as RpcInterface['getTransaction'];
  umi.rpc.call = (async method => method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
    : method === 'getFeeForMessage' ? { value: networkFee }
    : method === 'getBlockHeight' ? height : method === 'getSignaturesForAddress' ? history.map(signature => ({ signature })) : undefined) as RpcInterface['call'];
  const chain = createBackendPackChain(config, umi);
  const nonce = '07'.repeat(32);
  async function prepare() {
    return { ...await chain.prepare(buyer.publicKey, 'a'.repeat(64), nonce, DEFAULT_BACKEND_PACK, undefined, rewards), id: 'a'.repeat(64),
      status: 'prepared', signature: null, result: null, randomness: null, createdAt: 1 } as PackOrder;
  }
  async function sign(order: PackOrder) {
    const tx = umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
    tx.signatures[0] = await umi.eddsa.sign(tx.serializedMessage, buyer);
    return Buffer.from(umi.transactions.serialize(tx)).toString('base64');
  }
  function finalize(encoded: string, credited = 10_000_000n, funded = 2_759_680n, loaded = false) {
    const tx = umi.transactions.deserialize(Buffer.from(encoded, 'base64'));
    const index = tx.message.accounts.indexOf(authority.publicKey);
    const preBalances = tx.message.accounts.map(() => lamports(10000000));
    const postBalances = preBalances.map(value => lamports(value.basisPoints));
    if (index >= 0) postBalances[index] = lamports(preBalances[index]!.basisPoints + funded);
    const loadedAddresses = { writable: [] as typeof tx.message.accounts, readonly: [] as typeof tx.message.accounts };
    if (loaded && index >= 0) {
      tx.message.accounts.splice(index, 1); loadedAddresses.writable.push(authority.publicKey);
      preBalances.splice(index, 1); postBalances.splice(index, 1);
      preBalances.push(lamports(10000000)); postBalances.push(lamports(10000000n + funded));
    }
    confirmed = { ...tx, slot: 1, blockTime: null, meta: { err: null, fee: lamports(10000), logs: [], preBalances, postBalances,
      preTokenBalances: [], postTokenBalances: [{ accountIndex: 1, mint, owner: treasury, amount: { basisPoints: credited, decimals: 6, identifier: 'SKR' } }],
      innerInstructions: null, loadedAddresses, computeUnitsConsumed: 10000n, costUnits: null } } as TransactionWithMeta;
    commitment = 'finalized';
  }
  return { umi, chain, config, buyer, authority, treasury, collection, prepare, sign, finalize, nonce, rewards, probe, defaultSimulation,
    setCommitment(value: typeof commitment) { commitment = value; }, setHeight(value: number) { height = value; },
    setHistory(value: string[]) { history = value; }, setTokenBalance(value: bigint) { tokenBalance = value; },
    setMintDecimals(value: number) { mintDecimals = value; }, setDeliveryBalance(value: bigint) { deliveryBalance = value; },
    setProtocolFee(value: bigint) { protocolFee = value; }, setNetworkFee(value: number | null) { networkFee = value; } };
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
  assert.deepEqual(order.deliveryFunding, { recipient: f.authority.publicKey, amountLamports: '2759680' });
  const transfers = tx.message.instructions.filter(ix => tx.message.accounts[ix.programIndex] === '11111111111111111111111111111111');
  assert.equal(transfers.length, 1); assert.equal(Buffer.from(transfers[0]!.data).readBigUInt64LE(4), 2759680n);
  assert.equal(tx.message.accounts[transfers[0]!.accountIndexes[1]!], f.authority.publicKey);
  assert.equal(tx.message.accounts[transfers[0]!.accountIndexes[0]!], f.buyer.publicKey);
  assert.equal(order.networkFeeLamports, '3759680');
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
  for (const funded of [0n, 2759679n, 2759681n]) {
    f.finalize(signed, 10000000n, funded); await assert.rejects(() => f.chain.paymentStatus(order), /delivery payment verification/);
  }
  f.finalize(signed); assert.equal((await f.chain.paymentStatus(order)).status, 'paid');
  f.finalize(signed, 10000000n, 2759680n, true); assert.equal((await f.chain.paymentStatus(order)).status, 'paid');
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
test('server-signed delivery creates the buyer asset and keeps one stable transaction across retries', async () => {
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
test('delivery atomically returns unused SOL to the buyer; sponsored orders never refund server funds', async () => {
  const f = fixture(); const base = await f.prepare();
  for (const reward of f.rewards) {
    const order = { ...base, status: 'ready-to-claim' as const, result: reward.figureId, randomness: 'ab'.repeat(32) };
    const delivery = await f.chain.prepareDelivery(order, f.nonce, reward);
    const tx = f.umi.transactions.deserialize(Buffer.from(delivery.transaction, 'base64'));
    const transfers = tx.message.instructions.filter(ix => tx.message.accounts[ix.programIndex] === '11111111111111111111111111111111');
    const rent = await f.umi.rpc.getRent(packDeliveryAssetSize(f.buyer.publicKey, f.collection, reward));
    const change = BigInt(order.deliveryFunding!.amountLamports) - rent.basisPoints - CORE_CREATE_FEE - 10000n;
    assert.equal(transfers.length, change > 0n ? 1 : 0);
    if (change > 0n) {
      const ix = transfers[0]!;
      assert.equal(Buffer.from(ix.data).readBigUInt64LE(4), change);
      assert.equal(tx.message.accounts[ix.accountIndexes[0]!], f.authority.publicKey);
      assert.equal(tx.message.accounts[ix.accountIndexes[1]!], f.buyer.publicKey);
      assert.ok(tx.message.instructions.findIndex(ix => tx.message.accounts[ix.programIndex] === MPL_CORE_PROGRAM_ID) < tx.message.instructions.indexOf(ix));
    }
    assert.ok(tx.message.accounts.indexOf(f.buyer.publicKey) >= tx.message.header.numRequiredSignatures);
    delete order.deliveryFunding;
    const legacy = await f.chain.prepareDelivery(order, f.nonce, reward);
    const legacyTx = f.umi.transactions.deserialize(Buffer.from(legacy.transaction, 'base64'));
    assert.ok(!legacyTx.message.instructions.some(ix => legacyTx.message.accounts[ix.programIndex] === '11111111111111111111111111111111'));
  }
});
test('payment rejects insufficient SKR/altered mint precision but needs no sponsored delivery reserve', async () => {
  const f = fixture(); f.setTokenBalance(0n);
  await assert.rejects(() => f.prepare(), /Not enough SKR/);
  f.setTokenBalance(100_000_000n); f.setMintDecimals(9);
  await assert.rejects(() => f.prepare(), /currency/);
  f.setMintDecimals(6); f.setDeliveryBalance(1n);
  assert.ok((await f.prepare()).deliveryFunding);
  await assert.rejects(() => f.chain.prepare(f.treasury, 'a'.repeat(64), f.nonce, DEFAULT_BACKEND_PACK), /customer/);
});
test('delivery budget follows the largest eligible metadata, not the winning figure or table order', async () => {
  const f = fixture(); const first = await f.prepare();
  const reversed = await f.chain.prepare(f.buyer.publicKey, 'a'.repeat(64), f.nonce,
    { ...DEFAULT_BACKEND_PACK, drops: [...DEFAULT_BACKEND_PACK.drops].reverse() }, undefined, [...f.rewards].reverse());
  assert.deepEqual(reversed.deliveryFunding, first.deliveryFunding);
  assert.equal(Buffer.from(reversed.transaction, 'base64').includes(Buffer.from('/figures/')), false);
  for (const drops of [DEFAULT_BACKEND_PACK.drops.slice(0, 1), []]) {
    await assert.rejects(() => f.chain.prepare(f.buyer.publicKey, 'a'.repeat(64), f.nonce, { ...DEFAULT_BACKEND_PACK, drops }), /metadata/);
  }
});
test('changed Core fees, invalid RPC network costs and unverifiable creation fail before quoting payment', async () => {
  const f = fixture(); f.setProtocolFee(1600000n);
  await assert.rejects(() => f.prepare(), /fees changed/);
  f.setProtocolFee(1500000n);
  for (const fee of [null, 0, -1, 0.5, 100001]) {
    f.setNetworkFee(fee); await assert.rejects(() => f.prepare(), /estimate.*fees/);
  }
  f.setNetworkFee(10000); f.umi.rpc.getRent = async () => lamports(10000000n);
  await assert.rejects(() => f.prepare(), /purchase limit/);
});
test('insufficient SOL or malformed creation simulation never returns a payable transaction', async () => {
  const f = fixture();
  for (const accounts of [[], [null], [{ owner: SHOP_TOKEN_PROGRAM, lamports: 2749680 }]]) {
    f.umi.rpc.simulateTransaction = (async () => ({ err: null, accounts })) as unknown as RpcInterface['simulateTransaction'];
    await assert.rejects(() => f.prepare(), /fees changed/);
  }
  f.umi.rpc.simulateTransaction = (async () => ({ err: 'InsufficientFunds', accounts: [] })) as unknown as RpcInterface['simulateTransaction'];
  await assert.rejects(() => f.prepare(), /SOL balance/);
});
test('legacy sponsored payments still recover without a new SOL transfer or quote', async () => {
  const f = fixture(); const order = await f.prepare();
  delete order.deliveryFunding;
  const decoded = f.umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
  const message = { ...decoded.message, instructions: decoded.message.instructions.filter(ix => decoded.message.accounts[ix.programIndex] !== '11111111111111111111111111111111') };
  const old = { ...decoded, message, serializedMessage: f.umi.transactions.serializeMessage(message) };
  const marker = f.umi.eddsa.createKeypairFromSeed(createHmac('sha256', Buffer.from(f.nonce, 'hex')).update('ripsy-pack-payment-v1').digest());
  old.signatures[old.message.accounts.indexOf(marker.publicKey)] = await f.umi.eddsa.sign(old.serializedMessage, marker);
  order.transaction = Buffer.from(f.umi.transactions.serialize(old)).toString('base64');
  const signed = await f.sign(order); order.signature = f.chain.validateSigned(order, signed);
  f.finalize(signed, 10000000n, 0n);
  assert.equal((await f.chain.paymentStatus(order)).status, 'paid');
});
test('delivery budget parser rejects changed recipients, excessive amounts and double-counted totals', async () => {
  const f = fixture(); const order = await f.prepare();
  const { parsePackOrder } = await import('@rps/core/packs');
  assert.deepEqual(parsePackOrder(order).deliveryFunding, order.deliveryFunding);
  for (const funding of [null, { recipient: f.buyer.publicKey, amountLamports: '2759680' },
    { recipient: f.authority.publicKey, amountLamports: '10000001' }, { recipient: f.authority.publicKey, amountLamports: '0' },
    { recipient: f.authority.publicKey, amountLamports: '3759681' }, { recipient: f.authority.publicKey, amountLamports: 2759680 }, { recipient: 'invalid', amountLamports: '1' }]) {
    assert.throws(() => parsePackOrder({ ...order, deliveryFunding: funding }), /delivery budget/);
  }
  assert.throws(() => parsePackOrder({ ...order, engine: undefined }), /delivery budget/);
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
    if (tx.message.instructions.some(ix => tx.message.accounts[ix.programIndex] === MPL_CORE_PROGRAM_ID)) return f.probe(tx);
    const ix = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === '11111111111111111111111111111111')!;
    const input = Buffer.from(ix.data).readBigUInt64LE(4);
    const remaining = 250000n + input * 100n * 995n / 1000n - 10000000n;
    const data = getTokenAccountDataSerializer().serialize({ mint, owner: f.buyer.publicKey, amount: remaining, delegate: null,
      state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null });
    return { err: null, logs: [], accounts: [{ lamports: Number(100000000n - input - 3759680n) },
      { executable: false, owner: SHOP_TOKEN_PROGRAM, lamports: 2039280, data: [Buffer.from(data).toString('base64'), 'base64'] }, null] };
  }) as RpcInterface['simulateTransaction'];
  try {
    const order = await f.chain.prepare(f.buyer.publicKey, 'a'.repeat(64), f.nonce, DEFAULT_BACKEND_PACK, 'sol', f.rewards);
    const tx = f.umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
    assert.ok(Buffer.from(order.transaction, 'base64').length <= 1232);
    assert.equal(order.solFunding?.shortfall, '9750000'); assert.equal(order.networkFeeLamports, '3759680');
    assert.equal(order.deliveryFunding?.amountLamports, '2759680');
    const swap = tx.message.instructions.findIndex(ix => tx.message.accounts[ix.programIndex] === JUPITER);
    const payment = tx.message.instructions.findIndex(ix => tx.message.accounts[ix.programIndex] === SHOP_TOKEN_PROGRAM && ix.data[0] === 12);
    assert.ok(swap >= 0 && payment > swap);
    assert.equal(Buffer.from(tx.message.instructions[payment]!.data).readBigUInt64LE(1), 10000000n);
    assert.ok(!tx.message.accounts.includes(publicKey(PACK_PROGRAM_ID))); assert.ok(!tx.message.accounts.includes(MPL_CORE_PROGRAM_ID));
    assert.ok(f.chain.validateSigned(order as PackOrder, await f.sign(order as PackOrder)));
  } finally { globalThis.fetch = original; }
});
