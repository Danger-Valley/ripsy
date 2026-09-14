import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import { base58FromUint8Array, base64ToBase58, base64ToUint8Array } from '@solana-mobile/mobile-wallet-adapter-protocol/encoding';
import type { SolanaWalletSession } from './storage/solana-wallet-session';

const identity = {
  name: 'RIPSY',
  uri: 'https://www.ripsy.fun',
  icon: 'favicon.ico',
} as const;

export const isSolanaWalletSupported = true;

export async function connectSolanaWallet(previousSession?: SolanaWalletSession | null): Promise<SolanaWalletSession> {
  return transact(async wallet => {
    const authorization = await wallet.authorize({
      identity,
      chain: 'solana:mainnet',
      ...(previousSession?.authToken ? { auth_token: previousSession.authToken } : {}),
    });
    const account = authorization.accounts[0];
    if (!account) throw new Error('The wallet did not return a Solana account.');

    const accountAddress = account.address;
    return {
      address: toBase58Address(account),
      accountAddress,
      authToken: authorization.auth_token,
      walletUriBase: authorization.wallet_uri_base,
      ...(account.label ? { label: account.label } : {}),
    };
  }, previousSession?.walletUriBase ? { baseUri: previousSession.walletUriBase } : undefined);
}

export async function disconnectSolanaWallet(session: SolanaWalletSession): Promise<void> {
  await transact(
    wallet => wallet.deauthorize({ auth_token: session.authToken }),
    session.walletUriBase ? { baseUri: session.walletUriBase } : undefined,
  );
}

export function getSolanaWalletErrorMessage(cause: unknown): string {
  const code = getErrorCode(cause);
  if (code === 'ERROR_WALLET_NOT_FOUND') return 'Install a compatible Solana wallet to connect.';
  if (code === 'ERROR_ASSOCIATION_CANCELLED' || code === -1) return 'Wallet connection was cancelled.';
  if (code === 'ERROR_SESSION_TIMEOUT') return 'The wallet did not respond. Try again.';
  return 'Could not connect to the wallet. Try again.';
}

function toBase58Address(account: { address: string; publicKey?: ArrayLike<number> }): string {
  if (account.publicKey?.length === 32) {
    return base58FromUint8Array(Uint8Array.from(account.publicKey));
  }

  try {
    const bytes = base64ToUint8Array(account.address);
    if (bytes.length === 32) return base64ToBase58(account.address);
  } catch {
    // Wallet Standard accounts already return their address as base58.
  }
  return account.address;
}

function getErrorCode(cause: unknown): string | number | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  const code = cause.code;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}
