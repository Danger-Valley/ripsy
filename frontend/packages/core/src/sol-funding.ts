import type { TokenPayment } from '@rps/core/shop';

/** Additive receipt data. Amounts are base units, never floating point prices. */
export interface SolFunding {
  inputLamports: string;
  outputMint: string;
  shortfall: string;
  minimumOutput: string;
  expectedOutput: string;
  slippageBps: number;
}
export interface TokenShortfall {
  code: 'INSUFFICIENT_PURCHASE_TOKEN';
  mint: string;
  symbol: string;
  required: string;
  balance: string;
}
const address = (v: unknown) => typeof v === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const amount = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v) && BigInt(v) <= 18_446_744_073_709_551_615n;
export function parseTokenShortfall(value: unknown): TokenShortfall | null {
  const v = value as TokenShortfall | undefined;
  return v?.code === 'INSUFFICIENT_PURCHASE_TOKEN' && address(v.mint)
    && typeof v.symbol === 'string' && /^[A-Za-z0-9$._-]{1,16}$/.test(v.symbol)
    && amount(v.required) && amount(v.balance) && BigInt(v.required) > BigInt(v.balance) ? v : null;
}
export function validateSolFunding(value: unknown, payment?: TokenPayment): void {
  if (value === undefined) return; // Existing receipts remain valid.
  const v = value as SolFunding;
  if (!v || !payment || v.outputMint !== payment.mint || !amount(v.inputLamports) || BigInt(v.inputLamports) < 1n
    || !amount(v.shortfall) || BigInt(v.shortfall) < 1n || BigInt(v.shortfall) > BigInt(payment.amount)
    || !amount(v.minimumOutput) || BigInt(v.minimumOutput) < BigInt(v.shortfall)
    || !amount(v.expectedOutput) || BigInt(v.expectedOutput) < BigInt(v.minimumOutput)
    || !Number.isInteger(v.slippageBps) || v.slippageBps < 0 || v.slippageBps > 100) throw new Error('Invalid SOL purchase quote');
}
export function solFundingNotice(funding: SolFunding): string {
  return `SOL covers the missing tokens. Exchange and purchase happen together, or neither completes. Maximum price movement: ${funding.slippageBps / 100}%. Any extra tokens stay in your account. Network fees may still apply if the purchase fails.`;
}
