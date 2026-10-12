import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, lamports, publicKey, type RpcInterface } from '@metaplex-foundation/umi';
import { mplToolbox, findAssociatedTokenPda, getTokenAccountDataSerializer, getMintAccountDataSerializer, TokenState } from '@metaplex-foundation/mpl-toolbox';
import { Key, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { getCollectionV1AccountDataSerializer } from '@metaplex-foundation/mpl-core/dist/src/generated/types/collectionV1AccountData.js';
import { createShopChain } from './shop-chain.js';
import { loadShopConfig } from './shop-config.js';
import { FIGURE_TOKEN_PAYMENTS, figurePurchaseTotal, parseTokenShortfall, validateSolFunding } from '@rps/core/shop';
import { JUPITER, prepareSolFunding, verifySolFundingSimulation, WSOL } from './shop-sol-funding.js';
import { SHOP_TOKEN_PROGRAM, requireTokenBalance } from './shop-token-payment.js';
import { ShopError } from './shop-error.js';

function fixture() {
  const umi = createUmi('http://localhost:8899').use(mplToolbox());
  const buyer = generateSigner(umi), authority = generateSigner(umi);
  const payment = { ...FIGURE_TOKEN_PAYMENTS.jup!, amount: '1000000' };
  const source = findAssociatedTokenPda(umi, { owner: buyer.publicKey, mint: WSOL })[0];
  const output = findAssociatedTokenPda(umi, { owner: buyer.publicKey, mint: publicKey(payment.mint) })[0];
  umi.rpc.getAccount = async key => ({ exists: false, publicKey: key });
  umi.rpc.getAccounts = async keys => keys.map(key => ({ exists: false, publicKey: key }));
  const requests: URL[] = [];
  let mutate = (q: Record<string, any>) => q;
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url)); requests.push(u);
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'test-only-key');
    const amount = BigInt(u.searchParams.get('amount')!);
    const data = Buffer.alloc(39);
    createHash('sha256').update('global:route_v2').digest().copy(data, 0, 0, 8);
    data.writeBigUInt64LE(amount, 8);
    data.writeBigUInt64LE(amount * 100n, 16);
    data.writeUInt16LE(50, 24);
    data.writeUInt32LE(1, 30); // One fake route step; mocked RPC, no real exchange.
    data.writeUInt16LE(10000, 35);
    data[38] = 1;
    return new Response(JSON.stringify(mutate({ inputMint: WSOL, outputMint: payment.mint, inAmount: amount.toString(), outAmount: (amount * 100n).toString(), otherAmountThreshold: (amount * 100n * 995n / 1000n).toString(),
      swapMode: 'ExactIn', slippageBps: 50, setupInstructions: [], otherInstructions: [], cleanupInstruction: null,
      swapInstruction: { programId: JUPITER, data: data.toString('base64'), accounts: [
        { pubkey: buyer.publicKey, isSigner: true, isWritable: false }, { pubkey: source, isSigner: false, isWritable: true }, { pubkey: output, isSigner: false, isWritable: true },
        { pubkey: WSOL, isSigner: false, isWritable: false }, { pubkey: payment.mint, isSigner: false, isWritable: false },
        { pubkey: SHOP_TOKEN_PROGRAM, isSigner: false, isWritable: false }, { pubkey: SHOP_TOKEN_PROGRAM, isSigner: false, isWritable: false }, { pubkey: output, isSigner: false, isWritable: true },
      ] }, addressesByLookupTableAddress: {} })));
  };
  const prepare = (balance = 250000n, key: string | undefined = 'test-only-key') => prepareSolFunding(umi, buyer, payment, balance, key, [authority.publicKey], fetcher);
  const token = (mint: string, amount: bigint) => ({ executable: false, owner: SHOP_TOKEN_PROGRAM, lamports: 2039280,
    data: [Buffer.from(getTokenAccountDataSerializer().serialize({ mint: publicKey(mint), owner: buyer.publicKey, amount, delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null })).toString('base64'), 'base64'] });
  return { umi, buyer, authority, payment, source, output, requests, prepare, token, fetcher, mutate(fn: typeof mutate) { mutate = fn; } };
}

for (const quantity of [1, 2, 3]) test(`SOL-funded quantity ${quantity} preserves one exact payment or rejects before signing when oversized`, async () => {
  const f = fixture(), collection = generateSigner(f.umi).publicKey, treasury = generateSigner(f.umi).publicKey;
  const payment = { ...f.payment, amount: String(1000000 * quantity) };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  try {
    f.umi.rpc.getAccount = async key => {
      if (key === f.source) return { exists: false, publicKey: key };
      const data = key === collection
        ? getCollectionV1AccountDataSerializer().serialize({ key: Key.CollectionV1, updateAuthority: f.authority.publicKey, name: 'RIPSY', uri: 'https://www.ripsy.fun', numMinted: 0, currentSize: 0 })
        : key === f.payment.mint ? getMintAccountDataSerializer().serialize({ mintAuthority: null, supply: 1000000000n, decimals: 6, isInitialized: true, freezeAuthority: null })
          : getTokenAccountDataSerializer().serialize({ mint: publicKey(f.payment.mint), owner: f.buyer.publicKey, amount: 250000n, delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null });
      return { exists: true, publicKey: key, owner: key === collection ? MPL_CORE_PROGRAM_ID : SHOP_TOKEN_PROGRAM, lamports: lamports(2039280), executable: false, data };
    };
    f.umi.rpc.call = (async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') as RpcInterface['call'];
    f.umi.rpc.getBalance = async () => lamports(1000000000);
    f.umi.rpc.getLatestBlockhash = async () => ({ blockhash: publicKey('11111111111111111111111111111111'), lastValidBlockHeight: 100 });
    f.umi.rpc.simulateTransaction = (async tx => {
      const ix = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === '11111111111111111111111111111111')!;
      const input = Buffer.from(ix.data).readBigUInt64LE(4);
      return { err: null, logs: [], accounts: [{ lamports: Number(1000000000n - input - 6000000n) }, f.token(f.payment.mint, 250000n + input * 100n * 995n / 1000n - BigInt(payment.amount)), null] };
    }) as RpcInterface['simulateTransaction'];
    const chain = createShopChain({ ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta', collection, treasury, jupiterApiKey: 'test-only-key', authoritySecret: JSON.stringify([...f.authority.secretKey]) }, f.umi);
    // This deliberately lookup-free route exceeds the packet limit at three.
    // It must fail before returning bytes to approve, never split swap/payment.
    if (quantity === 3) {
      await assert.rejects(chain.prepare('jup', f.buyer.publicKey, '0', payment, 'sol', quantity), /This purchase is too large/);
      return;
    }
    const order = await chain.prepare('jup', f.buyer.publicKey, '0', payment, 'sol', quantity);
    const tx = f.umi.transactions.deserialize(Buffer.from(order.transaction, 'base64'));
    assert.ok(Buffer.from(order.transaction, 'base64').length <= 1232);
    assert.equal(quantity > 1 ? order.assets?.length : 1, quantity);
    assert.equal(tx.message.version, 0); assert.equal(tx.message.accounts[0], f.buyer.publicKey);
    assert.equal(tx.message.instructions.filter(ix => tx.message.accounts[ix.programIndex] === JUPITER).length, 1);
    const transfer = tx.message.instructions.find(ix => tx.message.accounts[ix.programIndex] === SHOP_TOKEN_PROGRAM && ix.data[0] === 12)!;
    assert.equal(Buffer.from(transfer.data).readBigUInt64LE(1), BigInt(payment.amount));
    const programs = tx.message.instructions.map(ix => tx.message.accounts[ix.programIndex]);
    assert.ok(programs.indexOf(JUPITER) < programs.indexOf(MPL_CORE_PROGRAM_ID));
    assert.equal(programs.filter(program => program === MPL_CORE_PROGRAM_ID).length, quantity);
    assert.equal(tx.signatures[0]!.every(byte => byte === 0), true);
    assert.equal(order.networkFeeLamports, '6000000'); assert.ok(order.solFunding);
    assert.equal(order.solFunding.shortfall, (BigInt(payment.amount) - 250000n).toString());
    const signed = await f.buyer.signTransaction(tx);
    assert.ok(chain.validateSigned({ transaction: order.transaction, buyer: f.buyer.publicKey }, Buffer.from(f.umi.transactions.serialize(signed)).toString('base64')));
    if (quantity > 1) {
      for (let index = 1; index < signed.message.header.numRequiredSignatures; index++) {
        const missing = { ...signed, signatures: signed.signatures.map((signature, signer) => signer === index ? new Uint8Array(64) : signature) };
        assert.throws(() => chain.validateSigned({ transaction: order.transaction, buyer: f.buyer.publicKey }, Buffer.from(f.umi.transactions.serialize(missing)).toString('base64')), /missing a valid signature/);
      }
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('router cannot receive unrelated buyer token accounts, including Token-2022 accounts', async () => {
  for (const owner of [SHOP_TOKEN_PROGRAM, publicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')]) {
    const f = fixture(), extra = generateSigner(f.umi).publicKey;
    f.mutate(q => ({ ...q, swapInstruction: { ...q.swapInstruction, accounts: [...q.swapInstruction.accounts, { pubkey: extra, isSigner: false, isWritable: true }] } }));
    f.umi.rpc.getAccounts = async keys => keys.map(key => key === extra ? { exists: true, publicKey: key, owner, lamports: lamports(2039280), executable: false, data: getTokenAccountDataSerializer().serialize({ mint: WSOL, owner: f.buyer.publicKey, amount: 100n, delegate: null, state: TokenState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null }) } : { exists: false, publicKey: key });
    await assert.rejects(f.prepare(), /unavailable/);
  }
});

test('sizes SOL against the shortfall and guaranteed output, locally wraps and closes new WSOL, never signs or sends', async () => {
  const f = fixture(), plan = (await f.prepare())!;
  assert.equal(plan.receipt.shortfall, '750000');
  assert.ok(BigInt(plan.receipt.minimumOutput) >= 750000n);
  assert.ok(BigInt(plan.receipt.inputLamports) < 100000n); // Initial rate probe is NOT what buyer pays.
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0]!.searchParams.get('wrapAndUnwrapSol'), 'false');
  assert.equal(f.requests[0]!.searchParams.get('destinationTokenAccount'), f.output);
  const instructions = plan.before.getInstructions();
  assert.deepEqual(instructions.map(ix => String(ix.programId)), ['ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', '11111111111111111111111111111111', SHOP_TOKEN_PROGRAM, JUPITER]);
  assert.equal(Buffer.from(instructions[2]!.data).readBigUInt64LE(4).toString(), plan.receipt.inputLamports);
  assert.equal(plan.after.getInstructions()[0]!.data[0], 9); // SPL close locally, rent returns to buyer.
  assert.equal(await f.prepare(1000000n, undefined), null);
  assert.equal(f.requests.length, 2);
});

test('absent key, unknown instructions/signers/protected accounts, altered amounts/slippage/fee and excessive spend fail closed', async () => {
  const f = fixture();
  await assert.rejects(() => f.prepare(0n, ''), /temporarily unavailable/);
  assert.equal(f.requests.length, 0);
  const mutations: Array<(q: Record<string, any>) => Record<string, any>> = [
    q => ({ ...q, inputMint: f.payment.mint }), q => ({ ...q, outputMint: WSOL }), q => ({ ...q, swapMode: 'ExactOut' }),
    q => ({ ...q, otherAmountThreshold: q.outAmount }), q => ({ ...q, slippageBps: 500 }),
    q => ({ ...q, swapInstruction: { ...q.swapInstruction, programId: f.authority.publicKey } }),
    q => ({ ...q, otherInstructions: [q.swapInstruction] }), q => ({ ...q, cleanupInstruction: q.swapInstruction }),
    q => ({ ...q, swapInstruction: { ...q.swapInstruction, accounts: [...q.swapInstruction.accounts, { pubkey: f.authority.publicKey, isWritable: false, isSigner: false }] } }),
    q => ({ ...q, swapInstruction: { ...q.swapInstruction, accounts: [...q.swapInstruction.accounts, { pubkey: WSOL, isWritable: false, isSigner: true }] } }),
    q => { const d = Buffer.from(q.swapInstruction.data, 'base64'); d.writeUInt16LE(1, 26); return { ...q, swapInstruction: { ...q.swapInstruction, data: d.toString('base64') } }; },
    q => { const d = Buffer.from(q.swapInstruction.data, 'base64'); d.writeBigUInt64LE(999n, 8); return { ...q, swapInstruction: { ...q.swapInstruction, data: d.toString('base64') } }; },
    q => ({ ...q, outAmount: '1', otherAmountThreshold: '1' }),
  ];
  for (const mutation of mutations) {
    f.mutate(mutation);
    await assert.rejects(() => f.prepare(), /unavailable|too large/);
  }
});

test('composed simulation must preserve pre-existing funds and produce enough tokens AFTER the purchase', async () => {
  const f = fixture(), plan = (await f.prepare())!;
  const expected = plan.tokenBalance + BigInt(plan.receipt.minimumOutput) - BigInt(f.payment.amount);
  const simulation = { err: null, logs: [], accounts: [null, f.token(f.payment.mint, expected), null] };
  verifySolFundingSimulation(plan, f.payment, f.buyer.publicKey, simulation);
  const closed = { executable: false, owner: publicKey('11111111111111111111111111111111'), lamports: 0, data: ['', 'base64'] };
  verifySolFundingSimulation(plan, f.payment, f.buyer.publicKey, { ...simulation, accounts: [null, f.token(f.payment.mint, expected), closed] });
  assert.throws(() => verifySolFundingSimulation(plan, f.payment, f.buyer.publicKey, { ...simulation, accounts: [null, f.token(f.payment.mint, expected), { ...closed, lamports: 1 }] }), /unavailable/);
  assert.throws(() => verifySolFundingSimulation(plan, f.payment, f.buyer.publicKey, { ...simulation, accounts: [null, f.token(f.payment.mint, expected - 1n), null] }), /unavailable/);
  assert.throws(() => verifySolFundingSimulation(plan, f.payment, f.authority.publicKey, simulation), /unavailable/);
  assert.throws(() => verifySolFundingSimulation(plan, f.payment, f.buyer.publicKey, { ...simulation, accounts: [null, f.token(WSOL, expected), null] }), /unavailable/);
  const existing = { ...plan, closeWrapped: false, wrappedBalance: 200n };
  verifySolFundingSimulation(existing, f.payment, f.buyer.publicKey, { ...simulation, accounts: [null, f.token(f.payment.mint, expected), f.token(WSOL, 200n)] });
  assert.throws(() => verifySolFundingSimulation(existing, f.payment, f.buyer.publicKey, { ...simulation, accounts: [null, f.token(f.payment.mint, expected), f.token(WSOL, 199n)] }), /unavailable/);
});

test('insufficient token recovery is structured, parsers reject malformed data and totals never sum token units with SOL', async () => {
  const f = fixture();
  assert.throws(() => requireTokenBalance(f.payment, 0n), (error: unknown) => error instanceof ShopError && parseTokenShortfall(error.recovery)?.required === f.payment.amount);
  assert.equal(parseTokenShortfall({ code: 'INSUFFICIENT_PURCHASE_TOKEN', mint: f.payment.mint, symbol: 'JUP', required: '1', balance: '1' }), null);
  const plan = (await f.prepare())!;
  validateSolFunding(plan.receipt, f.payment);
  assert.throws(() => validateSolFunding({ ...plan.receipt, shortfall: '1000001' }, f.payment));
  assert.throws(() => validateSolFunding({ ...plan.receipt, minimumOutput: '0' }, f.payment));
  assert.throws(() => validateSolFunding(plan.receipt));
  assert.equal(figurePurchaseTotal({ solFunding: plan.receipt, networkFeeLamports: '1000' } as any), '0.000008554 SOL');
});
