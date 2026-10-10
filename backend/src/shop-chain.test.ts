import assert from 'node:assert/strict';
import test from 'node:test';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, lamports, publicKey, type PublicKey, type RpcInterface } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getCollectionV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/collectionV1AccountData.js';
import { createShopChain } from './shop-chain.js';
import { loadShopConfig } from './shop-config.js';
import { FIGURES, FIGURE_TOKEN_PAYMENTS, parseMintOrder, type MintOrder } from '@rps/core/shop';
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

function tokenFixture(id: 'fig2' | 'bonk' | 'jup' | 'ore') {
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

for (const id of ['fig2', 'bonk', 'jup', 'ore'] as const) {
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
