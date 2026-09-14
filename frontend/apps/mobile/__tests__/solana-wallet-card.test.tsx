import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SolanaWalletCard, shortenAddress } from '../src/components/solana-wallet-card';
import { useSolanaWallet } from '../src/hooks/use-solana-wallet';

jest.mock('../src/hooks/use-solana-wallet');

const connect = jest.fn(() => Promise.resolve());
const disconnect = jest.fn(() => Promise.resolve());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSolanaWallet).mockReturnValue({
    address: null,
    label: null,
    status: 'disconnected',
    error: null,
    isSupported: true,
    connect,
    disconnect,
  });
});

test('connects from the disconnected wallet card', async () => {
  const renderer = await renderCard();
  const button = renderer.root.find(node => node.props.accessibilityHint === 'Opens an installed Solana wallet to connect it');

  await ReactTestRenderer.act(() => button.props.onPress());
  expect(connect).toHaveBeenCalledTimes(1);
});

test('shows the remembered address and disconnects it', async () => {
  const address = '7YWHMfk9JZe0LMkM4fV2hT3sGVB7uW9vW7ZxLmqeZjAa';
  jest.mocked(useSolanaWallet).mockReturnValue({
    address,
    label: 'Seeker wallet',
    status: 'connected',
    error: null,
    isSupported: true,
    connect,
    disconnect,
  });
  const renderer = await renderCard();

  expect(renderer.root.find(node => node.props.accessibilityLabel === `Wallet address ${address}`).props.children).toBe(shortenAddress(address));
  const button = renderer.root.find(node => node.props.accessibilityHint === 'Disconnects and forgets this wallet on this device');
  await ReactTestRenderer.act(() => button.props.onPress());
  expect(disconnect).toHaveBeenCalledTimes(1);
});

test('does not render wallet UI on unsupported platforms', async () => {
  jest.mocked(useSolanaWallet).mockReturnValue({
    address: null,
    label: null,
    status: 'disconnected',
    error: null,
    isSupported: false,
    connect,
    disconnect,
  });
  expect((await renderCard()).toJSON()).toBeNull();
});

async function renderCard() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SolanaWalletCard />);
  });
  return renderer;
}
