import * as Keychain from 'react-native-keychain';

export type SolanaWalletSession = Readonly<{
  address: string;
  accountAddress: string;
  authToken: string;
  walletUriBase?: string;
  label?: string;
}>;

const keychainService = 'com.dangervalley.ripsy.solana-wallet';
const listeners = new Set<(session: SolanaWalletSession | null) => void>();
export function subscribeSolanaWallet(listener: (session: SolanaWalletSession | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function parseSolanaWalletSession(value: string | null): SolanaWalletSession | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<SolanaWalletSession>;
    if (
      typeof candidate.address !== 'string'
      || candidate.address.length < 32
      || typeof candidate.accountAddress !== 'string'
      || candidate.accountAddress.length < 32
      || typeof candidate.authToken !== 'string'
      || candidate.authToken.length === 0
    ) return null;

    return {
      address: candidate.address,
      accountAddress: candidate.accountAddress,
      authToken: candidate.authToken,
      ...(typeof candidate.walletUriBase === 'string' && candidate.walletUriBase.length > 0
        ? { walletUriBase: candidate.walletUriBase }
        : {}),
      ...(typeof candidate.label === 'string' && candidate.label.length > 0
        ? { label: candidate.label }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function loadSolanaWalletSession(): Promise<SolanaWalletSession | null> {
  const credentials = await Keychain.getGenericPassword({ service: keychainService });
  return parseSolanaWalletSession(credentials ? credentials.password : null);
}

export async function saveSolanaWalletSession(session: SolanaWalletSession): Promise<void> {
  const saved = await Keychain.setGenericPassword('ripsy-solana-wallet', JSON.stringify(session), {
    service: keychainService,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  if (!saved) throw new Error('Could not save the Seeker connection securely. Try again.');
  listeners.forEach(listener => listener(session));
}

export async function clearSolanaWalletSession(): Promise<void> {
  const cleared = await Keychain.resetGenericPassword({ service: keychainService });
  if (!cleared) throw new Error('Could not forget the saved Seeker connection. Try again.');
  listeners.forEach(listener => listener(null));
}
