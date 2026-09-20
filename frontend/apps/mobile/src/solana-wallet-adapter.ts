import type { SolanaWalletSession } from './storage/solana-wallet-session';
import type { MintOrder, SeekerChallenge, SeekerProof } from '@rps/core/shop';

export const isSolanaWalletSupported = false;
export async function proveSeekerWallet(_challenge: SeekerChallenge): Promise<SeekerProof> {
  throw new Error('Seeker-exclusive figures require a Solana Seeker and its Seed Vault wallet.');
}
export async function signShopTransaction(_order: MintOrder): Promise<string> {
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
