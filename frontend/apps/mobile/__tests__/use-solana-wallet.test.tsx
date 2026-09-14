import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useSolanaWallet, type SolanaWalletStatus } from '../src/hooks/use-solana-wallet';
import { connectSolanaWallet, disconnectSolanaWallet } from '../src/solana-wallet-adapter';
import {
  clearSolanaWalletSession,
  loadSolanaWalletSession,
  saveSolanaWalletSession,
  type SolanaWalletSession,
} from '../src/storage/solana-wallet-session';

jest.mock('../src/solana-wallet-adapter', () => ({
  isSolanaWalletSupported: true,
  connectSolanaWallet: jest.fn(),
  disconnectSolanaWallet: jest.fn(),
  getSolanaWalletErrorMessage: jest.fn(() => 'Friendly wallet error'),
}));
jest.mock('../src/storage/solana-wallet-session', () => ({
  loadSolanaWalletSession: jest.fn(),
  saveSolanaWalletSession: jest.fn(),
  clearSolanaWalletSession: jest.fn(),
}));

const session: SolanaWalletSession = {
  address: '11111111111111111111111111111111',
  accountAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  authToken: 'wallet-auth-token',
  walletUriBase: 'https://wallet.example',
};

let wallet!: ReturnType<typeof useSolanaWallet>;

function WalletProbe() {
  wallet = useSolanaWallet();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadSolanaWalletSession).mockResolvedValue(null);
  jest.mocked(saveSolanaWalletSession).mockResolvedValue();
  jest.mocked(clearSolanaWalletSession).mockResolvedValue();
  jest.mocked(connectSolanaWallet).mockResolvedValue(session);
  jest.mocked(disconnectSolanaWallet).mockResolvedValue();
});

test('restores the remembered public wallet address without opening a wallet', async () => {
  jest.mocked(loadSolanaWalletSession).mockResolvedValueOnce(session);
  await renderHook();

  expect(wallet.status).toBe<SolanaWalletStatus>('connected');
  expect(wallet.address).toBe(session.address);
  expect(connectSolanaWallet).not.toHaveBeenCalled();
});

test('connects, saves, and disconnects a wallet', async () => {
  await renderHook();
  await ReactTestRenderer.act(() => wallet.connect());

  expect(connectSolanaWallet).toHaveBeenCalledWith(null);
  expect(saveSolanaWalletSession).toHaveBeenCalledWith(session);
  expect(wallet.address).toBe(session.address);

  await ReactTestRenderer.act(() => wallet.disconnect());
  expect(disconnectSolanaWallet).toHaveBeenCalledWith(session);
  expect(clearSolanaWalletSession).toHaveBeenCalled();
  expect(wallet.status).toBe<SolanaWalletStatus>('disconnected');
  expect(wallet.address).toBeNull();
});

test('keeps a friendly inline error after a cancelled connection', async () => {
  jest.mocked(connectSolanaWallet).mockRejectedValueOnce(new Error('technical details'));
  await renderHook();
  await ReactTestRenderer.act(() => wallet.connect());

  expect(wallet.status).toBe<SolanaWalletStatus>('disconnected');
  expect(wallet.error).toBe('Friendly wallet error');
});

async function renderHook() {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<WalletProbe />);
    await Promise.resolve();
  });
}
