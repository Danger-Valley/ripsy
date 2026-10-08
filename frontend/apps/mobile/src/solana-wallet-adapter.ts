import type { SolanaWalletSession } from './storage/solana-wallet-session';
import type { PurchaseTransaction, SeekerChallenge, SeekerProof, WalletChallenge, WalletProof } from '@rps/core/shop';

export const isSolanaWalletSupported = false;
export async function proveSeekerWallet(_challenge: SeekerChallenge): Promise<SeekerProof> {
  throw new Error('Seeker-exclusive figures require a Solana Seeker and its Seed Vault wallet.');
}
export async function proveWallet(_challenge: WalletChallenge): Promise<WalletProof> {
  throw new Error('Connect a supported Solana wallet to verify your army.');
}
export async function signShopTransaction(_order: PurchaseTransaction): Promise<string> {
  throw new Error('Connect a supported wallet to sign this purchase.');
}

export async function connectSolanaWallet(_previousSession?: SolanaWalletSession | null): Promise<SolanaWalletSession> {
  throw new Error('Solana Mobile wallet connection is available on Android only.');
}

export async function disconnectSolanaWallet(_session: SolanaWalletSession): Promise<void> {
  // There is no MWA session to revoke on unsupported platforms.
}

export function getSolanaWalletErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Could not connect to the wallet.';
}
