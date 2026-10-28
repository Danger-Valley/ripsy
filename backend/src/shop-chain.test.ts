import assert from 'node:assert/strict';
import test from 'node:test';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, lamports, publicKey, type PublicKey, type RpcInterface } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getCollectionV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/collectionV1AccountData.js';
import { createShopChain } from './shop-chain.js';
import { loadShopConfig } from './shop-config.js';
import { parseMintOrder, type MintOrder } from '@rps/core/shop';
import { FIGURES, FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';
import { findAssociatedTokenPda, getMintAccountDataSerializer, getTokenAccountDataSerializer, TokenState } from '@metaplex-foundation/mpl-toolbox';
import { SHOP_TOKEN_PROGRAM } from './shop-token-payment.js';

function fixture() {
  const umi = createUmi('http://localhost:8899');
  const authority = generateSigner(umi);
  const buyer = generateSigner(umi);
  const collection = generateSigner(umi).publicKey;
  const treasury = generateSigner(umi).publicKey;
  const config = { ...loadShopConfig({}), enabled: true, collection, treasury, authoritySecret: JSON.stringify(Array.from(authority.secretKey)), prices: { fig1: '100000000', fig2: '200000000' } };
  const collectionData = getCollectionV1AccountDataSerializer().serialize({ key: Key.CollectionV1, updateAuthority: authority.publicKey, name: 'RIPSY', uri: 'https://www.ripsy.fun', numMinted: 0, currentSize: 0 });
  umi.rpc.getAccount = async address => ({ exists: true, publicKey: address, owner: MPL_CORE_PROGRAM_ID, lamports: lamports(1000000n), executable: false, data: collectionData });
  umi.rpc.getBalance = async () => lamports(1000000000n);
  umi.rpc.getLatestBlockhash = async () => ({ blockhash: publicKey('11111111111111111111111111111111'), lastValidBlockHeight: 100 });
  umi.rpc.call = (async method => {
    if (method === 'getGenesisHash') return 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    if (method === 'getBlockHeight') return 101;
    if (method === 'getSignaturesForAddress') return [];
    throw new Error(`Unexpected RPC call: ${method}`);
  }) as RpcInterface['call'];
  umi.rpc.simulateTransaction = (async () => ({ err: null, logs: [], accounts: [{ lamports: 899000000 }] })) as unknown as RpcInterface['simulateTransaction'];
  const chain = createShopChain(config, umi);
  async function prepare() {
    const prepared = await chain.prepare('fig1', buyer.publicKey, '100000000');
    const order: MintOrder = { ...prepared, id: 'a'.repeat(64), buyer: buyer.publicKey, treasury, collection, figureId: 'fig1', cluster: 'devnet', priceLamports: '100000000', createdAt: Date.now(), status: 'prepared', signature: null, error: null };
    const transaction = umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
    const signed = await buyer.signTransaction(transaction);
    const encoded = Buffer.from(umi.transactions.serialize(signed)).toString('base64');
    return { order, transaction, signed, encoded };
  }
  return { umi, config, authority, buyer, collection, treasury, chain, prepare };
}

test('Core mint and exact SOL payment share a v0 message with buyer as owner/payer', async () => {
  const f = fixture();
  const { order, transaction, encoded } = await f.prepare();
  const message = transaction.message;
  assert.equal(message.version, 0);
  assert.equal(message.accounts[0], f.buyer.publicKey);
  assert.equal(message.instructions.length, 2);
  const payment = message.instructions[0]!;
  assert.equal(message.accounts[payment.programIndex], '11111111111111111111111111111111');
  assert.equal(message.accounts[payment.accountIndexes[0]!], f.buyer.publicKey);
  assert.equal(message.accounts[payment.accountIndexes[1]!], f.treasury);
  assert.equal(Buffer.from(payment.data).readBigUInt64LE(4), 100000000n);
  assert.equal(message.accounts[message.instructions[1]!.programIndex], MPL_CORE_PROGRAM_ID);
  const mint = message.instructions[1]!;
  assert.equal(message.accounts[mint.accountIndexes[0]!], order.asset);
  assert.equal(message.accounts[mint.accountIndexes[1]!], f.collection);
  assert.equal(message.accounts[mint.accountIndexes[2]!], f.authority.publicKey);
  assert.equal(message.accounts[mint.accountIndexes[3]!], f.buyer.publicKey);
  assert.equal(message.accounts[mint.accountIndexes[4]!], f.buyer.publicKey);
  assert.equal(order.networkFeeLamports, '1000000');
  assert.ok(Buffer.from(message.instructions[1]!.data).includes(Buffer.from('/figures/fig1.json')));
  assert.equal(f.chain.validateSigned(order, encoded).length >= 64, true);
  assert.throws(() => f.chain.validateSigned(order, order.transaction), /signature/);
});

test('new mint transactions use the exact canonical fighter name with no extra RIPSY prefix', async () => {
  const f = fixture();
  for (const figure of FIGURES.filter(candidate => candidate.id === 'fig1')) {
    const prepared = await f.chain.prepare(figure.id, f.buyer.publicKey, '100000000');
    const transaction = f.umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
    const data = Buffer.from(transaction.message.instructions[1]!.data);
    const nameLength = data.readUInt32LE(2); // CreateV1 discriminator + DataState.
    assert.equal(data.subarray(6, 6 + nameLength).toString('utf8'), figure.name);
  }
});

test('modified transaction message and missing authority signature are rejected', async () => {
  const f = fixture();
  const { order, signed } = await f.prepare();
  const bytes = Uint8Array.from(signed.serializedMessage);
  bytes[5] = bytes[5]! ^ 1;
  const altered = Buffer.from(f.umi.transactions.serialize({ ...signed, serializedMessage: bytes })).toString('base64');
  assert.throws(() => f.chain.validateSigned(order, altered), /changed/);
  const signatures = [...signed.signatures];
  signatures[1] = new Uint8Array(64);
  const missing = Buffer.from(f.umi.transactions.serialize({ ...signed, signatures })).toString('base64');
  assert.throws(() => f.chain.validateSigned(order, missing), /signature/);
});

test('simulation failure and wrong genesis reject preparation before any wallet payment', async () => {
  const f = fixture();
  f.umi.rpc.simulateTransaction = (async () => ({ err: 'InsufficientFunds', logs: [] })) as unknown as RpcInterface['simulateTransaction'];
  f.umi.rpc.getBalance = async () => lamports(0);
  await assert.rejects(() => f.prepare(), /Add SOL/);
  f.umi.rpc.call = (async () => 'wrong-network') as RpcInterface['call'];
  await assert.rejects(() => f.prepare(), /network/);
});

test('processed is pending; confirmed chain error is terminal failure', async () => {
  const f = fixture();
  const { order, encoded } = await f.prepare();
  order.signature = f.chain.validateSigned(order, encoded);
  f.umi.rpc.getSignatureStatuses = async () => [{ commitment: 'processed', error: null, slot: 1, confirmations: 0 }];
  assert.equal(await f.chain.status(order), 'pending');
  f.umi.rpc.getSignatureStatuses = (async () => [{ commitment: 'confirmed', error: { InstructionError: [0, 'test'] }, slot: 1, confirmations: 1 }]) as RpcInterface['getSignatureStatuses'];
  assert.equal(await f.chain.status(order), 'failed');
});

test('detached checkout waits for finalized success/failure, not processed or confirmed', async () => {
  const f = fixture(); const { order, encoded } = await f.prepare();
  order.signature = f.chain.validateSigned(order, encoded);
  for (const commitment of ['processed', 'confirmed'] as const) {
    f.umi.rpc.getSignatureStatuses = async () => [{ commitment, error: null, slot: 1, confirmations: 1 }];
    assert.equal(await f.chain.status(order, 'finalized'), 'pending');
  }
  f.umi.rpc.getSignatureStatuses = async () => [{ commitment: 'finalized', error: null, slot: 1, confirmations: null }];
  assert.equal(await f.chain.status(order, 'finalized'), 'confirmed');
  f.umi.rpc.getSignatureStatuses = (async () => [{ commitment: 'finalized', error: { InstructionError: [0, 'test'] }, slot: 1, confirmations: null }]) as RpcInterface['getSignatureStatuses'];
  assert.equal(await f.chain.status(order, 'finalized'), 'failed');
});

test('read-only reconciliation finds exact wallet-broadcast bytes before expiry without sending', async () => {
  const f = fixture(); const { order, signed } = await f.prepare();
  const signature = base58.deserialize(signed.signatures[0]!)[0];
  const original = f.umi.rpc.call;
  f.umi.rpc.call = (async (method, params) => {
    if (method === 'getBlockHeight') return 99;
    if (method === 'getSignaturesForAddress') { assert.deepEqual(params, [order.asset, { commitment: 'finalized', limit: 10 }]); return [{ signature }]; }
    return original(method, params);
  }) as RpcInterface['call'];
  f.umi.rpc.getTransaction = (async (_signature: unknown, options?: { commitment?: string }) => {
    assert.equal(options?.commitment, 'finalized'); return { ...signed, meta: { err: null } };
  }) as unknown as RpcInterface['getTransaction'];
  f.umi.rpc.sendTransaction = async () => { throw new Error('Must not broadcast'); };
  assert.equal(await f.chain.status(order, 'finalized'), 'confirmed'); assert.equal(order.signature, signature);
});

test('reconciliation expires only beyond finalized height with invalid blockhash and absent assets', async () => {
  const f = fixture(); const { order } = await f.prepare(); const original = f.umi.rpc.call;
  let valid: unknown = { value: false }, height = 101, exists = false;
  f.umi.rpc.call = (async (method, params) => {
    if (method === 'isBlockhashValid') { assert.deepEqual(params, ['11111111111111111111111111111111', { commitment: 'finalized' }]); return valid; }
    if (method === 'getBlockHeight') { assert.deepEqual(params, [{ commitment: 'finalized' }]); return height; }
    return original(method, params);
  }) as RpcInterface['call'];
  f.umi.rpc.getAccount = (async (address, options) => { assert.equal(options?.commitment, 'finalized'); return { exists, publicKey: address }; }) as RpcInterface['getAccount'];
  assert.equal(await f.chain.status(order, 'finalized'), 'expired');
  for (valid of [{ value: true }, {}, null]) await assert.rejects(f.chain.status(order, 'finalized'), /expiry requires/);
  valid = { value: false }; exists = true;
  await assert.rejects(f.chain.status(order, 'finalized'), /account history/);
  exists = false; height = 100;
  assert.equal(await f.chain.status(order, 'finalized'), 'pending');
  for (height of [NaN, -1, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(f.chain.status(order, 'finalized'), /block height/);
});

test('reconciliation rejects wrong network and missing history, never accepting an unrelated message', async () => {
  const f = fixture(); const { order, signed } = await f.prepare(); const original = f.umi.rpc.call;
  f.umi.rpc.call = (async () => 'wrong-network') as RpcInterface['call'];
  await assert.rejects(f.chain.status(order, 'finalized'), /network/);
  f.umi.rpc.call = (async (method, params) => method === 'getSignaturesForAddress' ? [{ signature: '1'.repeat(64) }] : original(method, params)) as RpcInterface['call'];
  f.umi.rpc.getTransaction = async () => null;
  await assert.rejects(f.chain.status(order, 'finalized'), /history requires/);
  const altered = { ...signed, serializedMessage: new Uint8Array([1, 2, 3]) };
  f.umi.rpc.getTransaction = (async () => ({ ...altered, meta: { err: null } })) as unknown as RpcInterface['getTransaction'];
  // Without expiry evidence, an unrelated transaction is not a successful mint.
  await assert.rejects(f.chain.status(order, 'finalized'));
  assert.equal(order.signature, null);
  const previous = f.umi.rpc.call;
  f.umi.rpc.call = (async (method, params) => method === 'isBlockhashValid' ? { value: false } : previous(method, params)) as RpcInterface['call'];
  f.umi.rpc.getAccount = async address => ({ exists: false, publicKey: address });
  assert.equal(await f.chain.status(order, 'finalized'), 'expired');
  assert.equal(order.signature, null);
});

test('malformed finalized RPC status or missing transaction result cannot report success', async () => {
  const f = fixture(); const { order, signed, encoded } = await f.prepare();
  const signature = f.chain.validateSigned(order, encoded); order.signature = signature;
  f.umi.rpc.getSignatureStatuses = (async () => [{ commitment: 'finalized' }]) as unknown as RpcInterface['getSignatureStatuses'];
  await assert.rejects(f.chain.status(order, 'finalized'), /status requires/);
  order.signature = null; const original = f.umi.rpc.call;
  f.umi.rpc.call = (async (method, params) => method === 'getSignaturesForAddress' ? [{ signature }] : original(method, params)) as RpcInterface['call'];
  f.umi.rpc.getTransaction = (async () => ({ ...signed, meta: {} })) as unknown as RpcInterface['getTransaction'];
  await assert.rejects(f.chain.status(order, 'finalized'), /result requires/);
  assert.equal(order.signature, null);
});

test('recovers a wallet-broadcast transaction even if the app never submitted its signature', async () => {
  const f = fixture();
  const { order, signed } = await f.prepare();
  const signature = base58.deserialize(signed.signatures[0]!)[0];
  f.umi.rpc.call = (async method => method === 'getBlockHeight' ? 101 : [{ signature }]) as RpcInterface['call'];
  f.umi.rpc.getTransaction = (async () => ({ ...signed, meta: { err: null } })) as unknown as RpcInterface['getTransaction'];
  assert.equal(await f.chain.status(order), 'confirmed');
  assert.equal(order.signature, signature);
});

test('expiry requires finalized height and complete history, not a missing RPC response', async () => {
  const f = fixture();
  const { order } = await f.prepare();
  assert.equal(await f.chain.status(order), 'expired');
  f.umi.rpc.call = (async method => method === 'getBlockHeight' ? 101 : [{ signature: '1'.repeat(64) }]) as RpcInterface['call'];
  f.umi.rpc.getTransaction = async () => null;
  await assert.rejects(() => f.chain.status(order), /reconciliation/);
});

function tokenFixture(id: string) {
  const f = fixture();
  f.config.cluster = 'mainnet-beta';
  const payment = FIGURE_TOKEN_PAYMENTS[id]!;
  const mint = publicKey(payment.mint);
  const source = findAssociatedTokenPda(f.umi, { owner: f.buyer.publicKey, mint, tokenProgramId: SHOP_TOKEN_PROGRAM })[0];
  const destination = findAssociatedTokenPda(f.umi, { owner: f.treasury, mint, tokenProgramId: SHOP_TOKEN_PROGRAM })[0];
  const original = f.umi.rpc.getAccount;
  let tokenBalance = BigInt(payment.amount);
  let decimals = payment.decimals;
  let owner: PublicKey = SHOP_TOKEN_PROGRAM;
  f.umi.rpc.getAccount = async address => address === f.collection ? original(address) : {
    exists: true, publicKey: address, owner, lamports: lamports(1000000n), executable: false,
    data: address === mint
      ? getMintAccountDataSerializer().serialize({ mintAuthority: null, supply: 10000000000000000n, decimals, isInitialized: true, freezeAuthority: null })
      : getTokenAccountDataSerializer().serialize({ mint, owner: f.buyer.publicKey, amount: tokenBalance, delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null }),
  };
  f.umi.rpc.call = (async method => method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : 0) as RpcInterface['call'];
  f.umi.rpc.simulateTransaction = (async () => ({ err: null, logs: [], accounts: [{ lamports: 997000000 }] })) as unknown as RpcInterface['simulateTransaction'];
  return { ...f, payment, mint, source, destination, setBalance: (value: bigint) => { tokenBalance = value; }, setDecimals: (value: number) => { decimals = value; }, setOwner: (value: typeof owner) => { owner = value; } };
}

for (const id of FIGURES.filter(figure => figure.purchasable && figure.tokenPayment).map(figure => figure.id)) {
  test(`${id}: three figures share one exact payment and one atomic, fully signed message`, async () => {
    const f = tokenFixture(id); const payment = { ...f.payment, amount: (BigInt(f.payment.amount) * 3n).toString() };
    f.setBalance(BigInt(payment.amount));
    const prepared = await f.chain.prepare(id, f.buyer.publicKey, '0', payment, undefined, 3);
    assert.equal(prepared.assets!.length, 3); assert.equal(new Set(prepared.assets).size, 3); assert.equal(prepared.assets![0], prepared.asset);
    const tx = f.umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
    assert.ok(Buffer.from(prepared.transaction, 'base64').length <= 1232);
    const transfer = tx.message.instructions.filter(ix => tx.message.accounts[ix.programIndex] === SHOP_TOKEN_PROGRAM);
    assert.equal(transfer.length, 1); assert.equal(Buffer.from(transfer[0]!.data).readBigUInt64LE(1), BigInt(payment.amount));
    const creations = tx.message.instructions.filter(ix => tx.message.accounts[ix.programIndex] === MPL_CORE_PROGRAM_ID);
    assert.equal(creations.length, 3);
    assert.deepEqual(creations.map(ix => tx.message.accounts[ix.accountIndexes[0]!]), prepared.assets);
    assert.ok(creations.every(ix => tx.message.accounts[ix.accountIndexes[3]!] === f.buyer.publicKey && tx.message.accounts[ix.accountIndexes[4]!] === f.buyer.publicKey));
    const order: MintOrder = { ...prepared, quantity: 3, id: 'c'.repeat(64), figureId: id, buyer: f.buyer.publicKey, cluster: 'mainnet-beta', priceLamports: '0', tokenPayment: payment, treasury: f.treasury, collection: f.collection, createdAt: 1, status: 'prepared', signature: null, error: null };
    assert.deepEqual(parseMintOrder(order), order);
    const signed = await f.buyer.signTransaction(tx);
    assert.ok(f.chain.validateSigned(order, Buffer.from(f.umi.transactions.serialize(signed)).toString('base64')));
    for (let index = 1; index < signed.signatures.length; index++) {
      const signatures = [...signed.signatures]; signatures[index] = new Uint8Array(64);
      assert.throws(() => f.chain.validateSigned(order, Buffer.from(f.umi.transactions.serialize({ ...signed, signatures })).toString('base64')), /signature/);
    }
    f.setBalance(BigInt(f.payment.amount));
    await assert.rejects(f.chain.prepare(id, f.buyer.publicKey, '0', payment, undefined, 3), /Not enough/);
  });
  test(`${id}: admin quote changes the actual checked transfer amount without changing currency`, async () => {
    const f = tokenFixture(id); const quote = { ...f.payment, amount: (BigInt(f.payment.amount) / 2n).toString() };
    const prepared = await f.chain.prepare(id, f.buyer.publicKey, '0', quote);
    const tx = f.umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
    assert.equal(Buffer.from(tx.message.instructions[1]!.data).readBigUInt64LE(1), BigInt(quote.amount));
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '0', { ...quote, mint: f.buyer.publicKey }), /currency/);
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '0', { ...quote, amount: '0' }), /currency/);
  });
  test(`${id}: exact checked token payment and Core purchase are atomic with buyer signing`, async () => {
    const f = tokenFixture(id);
    const prepared = await f.chain.prepare(id, f.buyer.publicKey, '0');
    const order: MintOrder = { ...prepared, id: 'b'.repeat(64), figureId: id, buyer: f.buyer.publicKey, cluster: 'mainnet-beta', priceLamports: '0', tokenPayment: f.payment, treasury: f.treasury, collection: f.collection, createdAt: 1, status: 'prepared', signature: null, error: null };
    assert.deepEqual(parseMintOrder(order), order);
    const tx = f.umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
    assert.equal(tx.message.accounts[0], f.buyer.publicKey);
    assert.equal(tx.message.instructions.length, 3);
    const [ata, transfer, core] = tx.message.instructions;
    assert.equal(Buffer.from(ata!.data)[0], 1); // Idempotent treasury ATA creation.
    assert.equal(tx.message.accounts[ata!.accountIndexes[1]!], f.destination);
    assert.equal(tx.message.accounts[transfer!.programIndex], SHOP_TOKEN_PROGRAM);
    assert.deepEqual(transfer!.accountIndexes.map(index => tx.message.accounts[index]), [f.source, f.mint, f.destination, f.buyer.publicKey]);
    const bytes = Buffer.from(transfer!.data);
    assert.equal(bytes[0], 12); // TransferChecked, not unchecked Transfer.
    assert.equal(bytes.readBigUInt64LE(1), BigInt(f.payment.amount));
    assert.equal(bytes[9], f.payment.decimals);
    assert.equal(tx.message.accounts[core!.programIndex], MPL_CORE_PROGRAM_ID);
    assert.ok(Buffer.from(core!.data).includes(Buffer.from(`/figures/${id}.json`)));
    const data = Buffer.from(core!.data); const nameLength = data.readUInt32LE(2);
    assert.equal(data.subarray(6, 6 + nameLength).toString('utf8'), FIGURES.find(f => f.id === id)!.name);
    assert.equal(prepared.networkFeeLamports, '3000000'); // No token amount subtracted from SOL fees.
    const signed = await f.buyer.signTransaction(tx);
    assert.ok(f.chain.validateSigned(order, Buffer.from(f.umi.transactions.serialize(signed)).toString('base64')));
    assert.throws(() => f.chain.validateSigned(order, prepared.transaction), /signature/);
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '1'), /configuration/);
  });
  test(`${id}: insufficient balance, decimals and wrong program fail before signing`, async () => {
    const f = tokenFixture(id);
    f.setBalance(BigInt(f.payment.amount) - 1n);
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '0'), /Not enough/);
    f.setBalance(BigInt(f.payment.amount)); f.setDecimals(f.payment.decimals + 1);
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '0'), /currency/);
    f.setDecimals(f.payment.decimals); f.setOwner(MPL_CORE_PROGRAM_ID);
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '0'), /currency/);
    f.config.cluster = 'devnet';
    await assert.rejects(() => f.chain.prepare(id, f.buyer.publicKey, '0'), /configuration/);
  });
}
