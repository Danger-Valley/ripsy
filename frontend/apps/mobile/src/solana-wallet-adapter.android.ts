import { AppState } from 'react-native';
import type { StoredAuthorization } from '@solana-mobile/seeker-connect-react-native';
import { getBase58Decoder, getBase64Encoder, getBase64Decoder, getTransactionDecoder } from '@solana/kit';
import { verifySignIn } from '@solana/wallet-standard-util';
import type { PurchaseTransaction, SeekerChallenge, SeekerProof, WalletChallenge, WalletProof } from '@rps/core/shop';
import type { SolanaWalletSession } from './storage/solana-wallet-session';
import { loadSolanaWalletSession, saveSolanaWalletSession } from './storage/solana-wallet-session';
import { isSeekerDevice } from './seeker-device';

const identity = { name: 'RIPSY', uri: 'https://www.ripsy.fun', icon: 'favicon.ico' } as const;
export const isSolanaWalletSupported = isSeekerDevice();

// Android-only SDK: never load its native module/view when starting iOS.
const sdk = () => (require('@solana-mobile/seeker-connect-react-native') as typeof import('@solana-mobile/seeker-connect-react-native')).SeekerConnect;
type Client = ReturnType<typeof sdk>;
let configuredChain: string | null = null;
let configuration: Promise<void> | null = null;
let operationInFlight = false;

async function withSeeker<T>(chain: string, action: (client: Client) => Promise<T>): Promise<T> {
  if (!isSolanaWalletSupported) throw new Error('Sign in with email on this device.');
  if (operationInFlight) throw new Error('Finish the current Seeker request before trying again.');
  operationInFlight = true;
  try {
    const client = sdk();
    if (!configuration || configuredChain !== chain) {
      configuredChain = chain;
      configuration = client.configure({ identity, chain,
        firstConnectWalletBaseUri: 'https://connect.solanamobile.com', associationTimeoutMs: 30_000 });
    }
    try { await configuration; }
    catch (cause) { configuration = null; configuredChain = null; throw cause; }
    return await action(client);
  } finally { operationInFlight = false; }
}

function requireForeground() {
  if (AppState.currentState && AppState.currentState !== 'active') throw new Error('Return to RIPSY to continue your Seeker request.');
}

function validateAuthorization(authorization: StoredAuthorization, chain: string) {
  if (authorization.chain !== chain) throw new Error('Seeker authorized a different Solana network. Nothing was signed.');
  if (!authorization.authToken || !authorization.accounts?.length) throw new Error('Seeker did not return a Solana account.');
  for (const account of authorization.accounts) {
    if (!(account.publicKey instanceof Uint8Array) || account.publicKey.length !== 32
      || getBase58Decoder().decode(account.publicKey) !== account.address) {
      throw new Error('Seeker returned inconsistent account information. Nothing was signed.');
    }
  }
  return authorization;
}

async function authorize(client: Client, chain: string, expectedAddress?: string): Promise<StoredAuthorization> {
  // The SDK owns its cache. Never import the old direct-MWA token or wallet URI.
  const cached = await client.restore();
  const reusable = cached?.chain === chain && (!expectedAddress || cached.accounts.some(account => account.address === expectedAddress));
  if (cached && !reusable) await client.disconnect();
  if (cached && reusable) return validateAuthorization(cached, chain);
  requireForeground();
  return validateAuthorization(await client.connect(), chain);
}

function sessionFrom(authorization: StoredAuthorization, preferred?: string): SolanaWalletSession {
  const account = authorization.accounts.find(candidate => candidate.address === preferred) ?? authorization.accounts[0]!;
  return {
    address: account.address,
    accountAddress: getBase64Decoder().decode(account.publicKey),
    authToken: authorization.authToken,
    ...(authorization.walletUriBase ? { walletUriBase: authorization.walletUriBase } : {}),
    ...(account.label ? { label: account.label } : {}),
  };
}

function requireBuyer(authorization: StoredAuthorization, address: string) {
  if (!authorization.accounts.some(account => account.address === address)) {
    throw new Error('The wallet account changed. Reconnect the account selected for this saved purchase.');
  }
}

export async function connectSolanaWallet(previousSession?: SolanaWalletSession | null, expectedAddress?: string): Promise<SolanaWalletSession> {
  return withSeeker('solana:mainnet', async client => {
    requireForeground();
    const authorization = await authorize(client, 'solana:mainnet', expectedAddress);
    if (expectedAddress) requireBuyer(authorization, expectedAddress);
    return sessionFrom(authorization, expectedAddress ?? previousSession?.address);
  });
}

export async function proveSeekerWallet(challenge: SeekerChallenge): Promise<SeekerProof> {
  return proveWallet(challenge);
}

export async function proveWallet(challenge: WalletChallenge): Promise<WalletProof> {
  return withSeeker('solana:mainnet', async client => {
    const session = await loadSolanaWalletSession();
    if (!session) throw new Error('Connect with Seeker first.');
    requireBuyer(await authorize(client, 'solana:mainnet'), session.address);
    requireForeground();
    const payload = { ...challenge, address: session.address };
    const result = await client.signIn(payload);
    if (result.address !== session.address || result.publicKey.length !== 32
      || getBase58Decoder().decode(result.publicKey) !== session.address
      || !verifySignIn(payload, { account: { address: result.address, publicKey: result.publicKey, chains: [], features: [] },
        signedMessage: result.signedMessage, signature: result.signature })) {
      throw new Error('Seeker did not verify the selected account and exact sign-in request.');
    }
    const refreshed = await client.restore();
    if (!refreshed) throw new Error('Reconnect with Seeker to save your verified account.');
    validateAuthorization(refreshed, 'solana:mainnet');
    requireBuyer(refreshed, session.address);
    await saveSolanaWalletSession(sessionFrom(refreshed, session.address));
    return { address: session.address, nonce: challenge.nonce,
      signature: Array.from(result.signature), signedMessage: Array.from(result.signedMessage) };
  });
}

export async function signShopTransaction(order: PurchaseTransaction): Promise<string> {
  const chain = order.cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet';
  return withSeeker(chain, async client => {
    const session = await loadSolanaWalletSession();
    if (!session || session.address !== order.buyer) throw new Error('Reconnect the wallet selected for this purchase.');
    const originalBytes = Uint8Array.from(getBase64Encoder().encode(order.transaction));
    const original = getTransactionDecoder().decode(originalBytes.slice());
    if (!Object.keys(original.signatures).includes(order.buyer)) throw new Error('This purchase does not require the selected wallet. Nothing was signed.');
    const prefix = original.messageBytes[0]!;
    const version = prefix >= 128 ? prefix - 128 : 'legacy';
    const authorization = await authorize(client, chain);
    requireBuyer(authorization, order.buyer);
    if (!authorization.capabilities?.supportedTransactionVersions.includes(version)) {
      throw new Error('Update Seeker Wallet to support this purchase transaction. Nothing was signed.');
    }
    await saveSolanaWalletSession(sessionFrom(authorization, order.buyer));
    requireForeground();
    // Pass the exact pre-signed bytes. The backend, not the wallet SDK, submits.
    const results = await client.signTransactions([originalBytes]);
    if (results.length !== 1 || !(results[0] instanceof Uint8Array)) throw new Error('Seeker did not return one signed purchase.');
    const signedBytes = results[0];
    const signed = getTransactionDecoder().decode(signedBytes);
    if (!equalBytes(original.messageBytes, signed.messageBytes)
      || Object.entries(original.signatures).some(([address, signature]) => signature && !equalBytes(signature, Object.entries(signed.signatures).find(([key]) => key === address)?.[1]))) {
      throw new Error('The wallet changed the purchase transaction. Nothing was submitted.');
    }
    const buyerSignature = Object.entries(signed.signatures).find(([address]) => address === order.buyer)?.[1];
    if (!buyerSignature || buyerSignature.length !== 64 || !buyerSignature.some(byte => byte !== 0)) throw new Error('Seeker did not sign this purchase with the selected account.');
    return getBase64Decoder().decode(signedBytes);
  });
}

function equalBytes(left: ArrayLike<number>, right?: ArrayLike<number> | null) {
  return Boolean(right && left.length === right.length && Array.from(left).every((byte, index) => byte === right[index]));
}

export async function disconnectSolanaWallet(_session: SolanaWalletSession): Promise<void> {
  // SDK disconnect only forgets its authorization; it never launches a wallet.
  await withSeeker('solana:mainnet', client => client.disconnect());
}

export function getSolanaWalletErrorMessage(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
  if (code === 'no-wallet-found') return 'Seeker Wallet is unavailable. Update your wallet and try again.';
  if (code === 'cancelled' || code === 'authorization-declined' || code === 'request-declined') return 'Seeker request was cancelled. Your purchase stays saved.';
  if (code === 'association-failed') return 'Could not reach Seeker Wallet. Return to RIPSY and try again.';
  if (code === 'session-closed') return 'Seeker connection closed. Check your saved purchase before trying again.';
  if (code === 'not-configured') return 'Seeker Connect is unavailable in this build. Update RIPSY and try again.';
  if (code === 'no-activity') return 'Return to RIPSY to connect with Seeker.';
  if (typeof code === 'string') return 'Could not complete the Seeker request. Your purchase stays saved. Try again.';
  return cause instanceof Error ? cause.message : 'Could not connect with Seeker. Try again.';
}
