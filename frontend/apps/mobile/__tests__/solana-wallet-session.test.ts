import * as Keychain from 'react-native-keychain';
import {
  clearSolanaWalletSession,
  loadSolanaWalletSession,
  parseSolanaWalletSession,
  saveSolanaWalletSession,
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
