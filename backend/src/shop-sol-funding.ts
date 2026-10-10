import { publicKey, lamports, transactionBuilder, type Umi, type Signer, type AddressLookupTableInput, type RpcSimulateTransactionResult } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { closeToken, createIdempotentAssociatedToken, fetchAddressLookupTable, findAssociatedTokenPda, safeFetchToken, syncNative, TokenState, transferSol } from '@metaplex-foundation/mpl-toolbox';
import { validateSolFunding, type SolFunding, type TokenPayment } from '@rps/core/shop';
import { SHOP_TOKEN_PROGRAM } from './shop-token-payment.js';
import { ShopError } from './shop-error.js';
import { createHash } from 'node:crypto';

export const WSOL = publicKey('So11111111111111111111111111111111111111112');
export const JUPITER = publicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const ATA = publicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SLIPPAGE = 50;
const MAX_INPUT = 10_000_000_000n;
// Anchor ExactIn route ABIs: no token ledger, ExactOut, close or fee claims.
const ROUTES = new Map(['route', 'shared_accounts_route', 'route_v2', 'shared_accounts_route_v2']
  .map(name => [createHash('sha256').update(`global:${name}`).digest().subarray(0, 8).toString('hex'), name]));
const unavailable = (stage = 'provider') => {
  const error = new ShopError('Buy with SOL is temporarily unavailable. No payment was sent. Try again later.', 503);
  error.cause = `sol-funding:${stage}`; // Fixed internal stage only, never provider payload/key.
  return error;
};
const uint = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v) && BigInt(v) <= 18_446_744_073_709_551_615n;
interface ApiInstruction { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }
interface BuildResponse {
  inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold: string;
  swapMode: string; slippageBps: number; swapInstruction: ApiInstruction;
  setupInstructions?: ApiInstruction[]; cleanupInstruction?: ApiInstruction | null;
  otherInstructions?: ApiInstruction[]; tipInstruction?: ApiInstruction | null;
  addressesByLookupTableAddress?: Record<string, string[]> | null;
}
export interface SolFundingPlan {
  before: ReturnType<typeof transactionBuilder>;
  after: ReturnType<typeof transactionBuilder>;
  lookups: AddressLookupTableInput[];
  receipt: SolFunding;
  outputAccount: string;
  wrappedAccount: string;
  tokenBalance: bigint;
  wrappedBalance: bigint;
  closeWrapped: boolean;
}

/** Jupiter supplies only a router instruction. All fund movements/setup are local.
 * Remote instructions never receive the mint authority or purchase accounts.
 * A route must fit ONE transaction; there is deliberately no split fallback. */
export async function prepareSolFunding(umi: Umi, buyer: Signer, payment: TokenPayment, balance: bigint,
  apiKey: string | undefined, protectedAccounts: string[], fetcher: typeof fetch = fetch, maxRouteAccounts: 20 | 16 | 12 = 20): Promise<SolFundingPlan | null> {
  const shortfall = BigInt(payment.amount) - balance;
  if (shortfall <= 0n) return null;
  if (!apiKey) throw unavailable();
  const mint = publicKey(payment.mint);
  if (mint === WSOL) throw unavailable();
  const source = findAssociatedTokenPda(umi, { owner: buyer.publicKey, mint: WSOL, tokenProgramId: SHOP_TOKEN_PROGRAM });
  const destination = findAssociatedTokenPda(umi, { owner: buyer.publicKey, mint, tokenProgramId: SHOP_TOKEN_PROGRAM });
  const wrapped = await safeFetchToken(umi, source);
  if (wrapped && (wrapped.header.owner !== SHOP_TOKEN_PROGRAM || wrapped.owner !== buyer.publicKey || wrapped.mint !== WSOL || wrapped.state !== TokenState.Initialized)) throw unavailable();
  const quote = async (input: bigint) => {
    if (input < 1n || input > MAX_INPUT) throw new ShopError('This SOL purchase is too large. Add the required tokens to your account instead.');
    const url = new URL('https://api.jup.ag/swap/v2/build');
    for (const [key, value] of Object.entries({ inputMint: WSOL, outputMint: mint, amount: input.toString(), taker: buyer.publicKey,
      slippageBps: String(SLIPPAGE), maxAccounts: String(maxRouteAccounts), wrapAndUnwrapSol: 'false', destinationTokenAccount: destination[0], platformFeeBps: '0' })) url.searchParams.set(key, value);
    try {
      const response = await fetcher(url, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(8_000), redirect: 'error' });
      if (!response.ok) throw unavailable();
      const raw = await response.text();
      if (raw.length > 150_000) throw unavailable();
      const q = JSON.parse(raw) as BuildResponse;
      if (q.inputMint !== WSOL || q.outputMint !== mint || q.inAmount !== input.toString() || q.swapMode !== 'ExactIn'
        || q.slippageBps !== SLIPPAGE || !uint(q.outAmount) || !uint(q.otherAmountThreshold)
        || BigInt(q.otherAmountThreshold) > BigInt(q.outAmount)
        || BigInt(q.otherAmountThreshold) < BigInt(q.outAmount) * BigInt(10_000 - SLIPPAGE) / 10_000n
        || BigInt(q.otherAmountThreshold) > BigInt(q.outAmount) * BigInt(10_000 - SLIPPAGE) / 10_000n + 1n) throw unavailable();
      // Program threshold rounding can differ by one base unit. Use the lower
      // bound for sizing/review; never promise an extra unit from API rounding.
      const conservative = BigInt(q.outAmount) * BigInt(10_000 - SLIPPAGE) / 10_000n;
      if (conservative < 1n) throw unavailable();
      return { ...q, otherAmountThreshold: conservative.toString() };
    } catch { throw unavailable(); }
  };
  // ExactIn-only V2: first discover the rate, then size against MINIMUM output,
  // not optimistic output. Bounded requests, integer arithmetic, 0.2% headroom.
  let input = 100_000n;
  let q = await quote(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    const minimum = BigInt(q.otherAmountThreshold);
    const target = (input * shortfall * 1002n + minimum * 1000n - 1n) / (minimum * 1000n) + 1n;
    if (attempt > 0 && minimum >= shortfall) break;
    input = target;
    q = await quote(input);
  }
  if (BigInt(q.otherAmountThreshold) < shortfall) throw unavailable();
  const receipt: SolFunding = { inputLamports: input.toString(), outputMint: payment.mint, shortfall: shortfall.toString(),
    minimumOutput: q.otherAmountThreshold, expectedOutput: q.outAmount, slippageBps: SLIPPAGE };
  validateSolFunding(receipt, payment);
  // Refuse additional instructions, fees or signers from a remote response.
  if (q.otherInstructions?.length || q.tipInstruction || q.cleanupInstruction) throw unavailable('extra-instructions');
  for (const ix of q.setupInstructions ?? []) {
    if (ix.programId !== ATA || !Array.isArray(ix.accounts) || ix.accounts.length < 6
      || ix.accounts[0]?.pubkey !== buyer.publicKey || ![source[0], destination[0]].includes(publicKey(ix.accounts[1]!.pubkey))
      || ix.accounts[2]?.pubkey !== buyer.publicKey || ![WSOL, mint].includes(publicKey(ix.accounts[3]!.pubkey))
      || ix.accounts[4]?.pubkey !== '11111111111111111111111111111111' || ix.accounts[5]?.pubkey !== SHOP_TOKEN_PROGRAM
      || ix.accounts.some(a => a.isSigner && a.pubkey !== buyer.publicKey)
      || !['', 'AA==', 'AQ=='].includes(ix.data)) throw unavailable('setup');
  }
  const swap = q.swapInstruction;
  if (!swap || swap.programId !== JUPITER || !Array.isArray(swap.accounts) || swap.accounts.length > 64 || swap.accounts.length < 3
    || typeof swap.data !== 'string' || swap.data.length > 1500 || !/^[A-Za-z0-9+/]+={0,2}$/.test(swap.data)
    || ![buyer.publicKey, source[0], destination[0]].every(key => swap.accounts.some(a => a.pubkey === key))
    || !swap.accounts.some(a => a.pubkey === buyer.publicKey && a.isSigner)
    || swap.accounts.some(a => typeof a.isSigner !== 'boolean' || typeof a.isWritable !== 'boolean'
      || (a.isSigner && a.pubkey !== buyer.publicKey) || protectedAccounts.includes(a.pubkey))) throw unavailable('accounts');
  const data = Buffer.from(swap.data, 'base64');
  const route = ROUTES.get(data.subarray(0, 8).toString('hex'));
  if (!route || data.length < 31) throw unavailable('abi');
  // V2 ABI verified against the Jupiter-owned mainnet Anchor IDL. Amounts are
  // before the route vector, unlike legacy V1. Unknown ABIs fail closed.
  const v2 = route.endsWith('_v2'), shared = route.startsWith('shared_');
  const offset = v2 ? shared ? 9 : 8 : data.length - 19;
  if (data.length < offset + (v2 ? 26 : 19) || data.readBigUInt64LE(offset) !== input
    || data.readBigUInt64LE(offset + 8) !== BigInt(q.outAmount) || data.readUInt16LE(offset + 16) !== SLIPPAGE
    || (v2 ? data.readUInt16LE(offset + 18) !== 0 || data.readUInt16LE(offset + 20) !== 0 : data[offset + 18] !== 0)) throw unavailable('amounts');
  if (v2) {
    const count = data.readUInt32LE(offset + 22);
    if (count < 1 || count > 16 || data.length < offset + 26 + 5 * count) throw unavailable('route-vector');
  }
  const required = v2
    ? shared ? { 1: buyer.publicKey, 2: source[0], 5: destination[0], 6: WSOL, 7: mint, 8: SHOP_TOKEN_PROGRAM, 9: SHOP_TOKEN_PROGRAM }
      : { 0: buyer.publicKey, 1: source[0], 2: destination[0], 3: WSOL, 4: mint, 5: SHOP_TOKEN_PROGRAM, 6: SHOP_TOKEN_PROGRAM, 7: destination[0] }
    : shared ? { 0: SHOP_TOKEN_PROGRAM, 2: buyer.publicKey, 3: source[0], 6: destination[0], 7: WSOL, 8: mint }
      : { 0: SHOP_TOKEN_PROGRAM, 1: buyer.publicKey, 2: source[0], 3: destination[0], 5: mint };
  if (Object.entries(required).some(([i, key]) => swap.accounts[Number(i)]?.pubkey !== key)) throw unavailable('destinations');
  // Never expose another buyer-owned token account to a routed CPI.
  const writable = [...new Set(swap.accounts.filter(a => a.isWritable && a.pubkey !== buyer.publicKey).map(a => publicKey(a.pubkey)))];
  const accounts = await umi.rpc.getAccounts(writable);
  for (const a of accounts) {
    if (a.exists && (a.owner === SHOP_TOKEN_PROGRAM || a.owner === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') && a.data.length >= 165
      && base58.deserialize(a.data.slice(32, 64))[0] === buyer.publicKey && ![source[0], destination[0]].includes(a.publicKey)) throw unavailable('unrelated-token');
  }
  const tableKeys = Object.keys(q.addressesByLookupTableAddress ?? {});
  if (tableKeys.length > 6) throw unavailable();
  const lookups = await Promise.all(tableKeys.map(async key => {
    const table = await fetchAddressLookupTable(umi, publicKey(key));
    if (table.header.owner !== publicKey('AddressLookupTab1e1111111111111111111111111') || table.deactivationSlot !== 18_446_744_073_709_551_615n) throw unavailable();
    return { publicKey: table.publicKey, addresses: table.addresses };
  }));
  const before = createIdempotentAssociatedToken(umi, { payer: buyer, owner: buyer.publicKey, mint: WSOL, ata: source, tokenProgram: SHOP_TOKEN_PROGRAM })
    .add(createIdempotentAssociatedToken(umi, { payer: buyer, owner: buyer.publicKey, mint, ata: destination, tokenProgram: SHOP_TOKEN_PROGRAM }))
    .add(transferSol(umi, { source: buyer, destination: source[0], amount: lamports(input) }))
    .add(syncNative(umi, { account: source }))
    .add({ instruction: { programId: JUPITER, data: Buffer.from(swap.data, 'base64'), keys: swap.accounts.map(a => ({ ...a, pubkey: publicKey(a.pubkey) })) }, signers: [buyer], bytesCreatedOnChain: 0 });
  return { before, after: wrapped ? transactionBuilder() : closeToken(umi, { account: source, destination: buyer.publicKey, owner: buyer }),
    lookups, receipt, outputAccount: destination[0], wrappedAccount: source[0], tokenBalance: balance, wrappedBalance: wrapped?.amount ?? 0n, closeWrapped: !wrapped };
}

/** Audit the composed simulation, including the purchase, not just the swap. */
export function verifySolFundingSimulation(plan: SolFundingPlan, payment: TokenPayment, buyer: string, simulation: RpcSimulateTransactionResult) {
  const tokenAmount = (a: NonNullable<RpcSimulateTransactionResult['accounts']>[number], mint: string) => {
    if (!a || a.owner !== SHOP_TOKEN_PROGRAM || a.data[1] !== 'base64') throw unavailable('simulation-account');
    const data = Buffer.from(a.data[0]!, 'base64');
    if (data.length !== 165 || base58.deserialize(data.subarray(0, 32))[0] !== mint
      || base58.deserialize(data.subarray(32, 64))[0] !== buyer || data[108] !== TokenState.Initialized) throw unavailable('simulation-token');
    return data.readBigUInt64LE(64);
  };
  const output = tokenAmount(simulation.accounts?.[1] ?? null, payment.mint);
  if (output < plan.tokenBalance + BigInt(plan.receipt.minimumOutput) - BigInt(payment.amount)) throw unavailable('simulation-output');
  if (plan.closeWrapped) {
    // Some RPC nodes report a closed account as a zero-lamport, empty system
    // account rather than null. Both mean the WSOL rent returned to the buyer.
    const closed = simulation.accounts?.[2];
    if (closed && (closed.lamports !== 0 || closed.owner !== '11111111111111111111111111111111'
      || closed.executable || closed.data[1] !== 'base64' || closed.data[0] !== '')) throw unavailable('simulation-close');
  } else if (tokenAmount(simulation.accounts?.[2] ?? null, WSOL) < plan.wrappedBalance) throw unavailable();
}
