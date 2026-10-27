import * as Keychain from 'react-native-keychain';
import {
  clearSolanaWalletSession,
  loadSolanaWalletSession,
  parseSolanaWalletSession,
  saveSolanaWalletSession,
  subscribeSolanaWallet,
  type SolanaWalletSession,
} from '../src/storage/solana-wallet-session';

const session: SolanaWalletSession = {
  address: '11111111111111111111111111111111',
  accountAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  authToken: 'wallet-auth-token',
  walletUriBase: 'https://wallet.example',
  label: 'Primary wallet',
};

beforeEach(() => jest.clearAllMocks());

test('parses a complete saved wallet session', () => {
  expect(parseSolanaWalletSession(JSON.stringify(session))).toEqual(session);
});

test.each([null, '', '{}', '{bad-json', JSON.stringify({ ...session, authToken: '' })])(
  'rejects an invalid saved wallet session',
  value => expect(parseSolanaWalletSession(value)).toBeNull(),
);

test('loads, saves, and clears the wallet session in protected storage', async () => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({
    username: 'ripsy-solana-wallet',
    password: JSON.stringify(session),
    service: 'test',
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });

  await expect(loadSolanaWalletSession()).resolves.toEqual(session);
  await saveSolanaWalletSession(session);
  await clearSolanaWalletSession();

  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'ripsy-solana-wallet',
    JSON.stringify(session),
    expect.objectContaining({ service: 'com.dangervalley.ripsy.solana-wallet' }),
  );
  expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'com.dangervalley.ripsy.solana-wallet' });
});

test('home and shop observers share saved wallet changes and unsubscribe cleanly', async () => {
  const observer = jest.fn();
  const unsubscribe = subscribeSolanaWallet(observer);
  await saveSolanaWalletSession(session);
  await clearSolanaWalletSession();
  expect(observer.mock.calls).toEqual([[session], [null]]);
  unsubscribe();
  await saveSolanaWalletSession(session);
  expect(observer).toHaveBeenCalledTimes(2);
});

test('failed secure storage cannot publish a successful connection or local disconnect', async () => {
  const observer = jest.fn(); const unsubscribe = subscribeSolanaWallet(observer);
  jest.mocked(Keychain.setGenericPassword).mockResolvedValueOnce(false);
  await expect(saveSolanaWalletSession(session)).rejects.toThrow('securely');
  jest.mocked(Keychain.resetGenericPassword).mockResolvedValueOnce(false);
  await expect(clearSolanaWalletSession()).rejects.toThrow('forget');
  expect(observer).not.toHaveBeenCalled(); unsubscribe();
});
