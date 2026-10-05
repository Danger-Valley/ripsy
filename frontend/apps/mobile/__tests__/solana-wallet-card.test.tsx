import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SolanaWalletCard, shortenAddress } from '../src/components/solana-wallet-card';
import { useSolanaWallet } from '../src/hooks/use-solana-wallet';
import { usePrivyWallet } from '../src/hooks/use-privy-wallet';

jest.mock('../src/hooks/use-solana-wallet');
jest.mock('../src/hooks/use-privy-wallet');

const connect = jest.fn(() => Promise.resolve());
const disconnect = jest.fn(() => Promise.resolve());
const register = jest.fn();
const refresh = jest.fn(() => Promise.resolve());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePrivyWallet).mockReturnValue({ address: null, refresh } as unknown as ReturnType<typeof usePrivyWallet>);
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
  const button = renderer.root.find(node => node.props.accessibilityHint === 'Opens your Seeker wallet to connect it');

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

test('offers Register and no wallet connector on non-Seeker devices', async () => {
  jest.mocked(useSolanaWallet).mockReturnValue({
    address: null,
    label: null,
    status: 'disconnected',
    error: null,
    isSupported: false,
    connect,
    disconnect,
  });
  const renderer = await renderCard();
  const action = renderer.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Register');
  await ReactTestRenderer.act(() => action.props.onPress());
  expect(register).toHaveBeenCalledTimes(1);
  expect(connect).not.toHaveBeenCalled();
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Connect your wallet')).toHaveLength(0);
});

test('signed-in email users see account management instead of another registration', async () => {
  jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: false });
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: 'emailwallet11111111111111111111111' });
  const renderer = await renderCard();
  const action = renderer.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Manage account');
  await ReactTestRenderer.act(() => action.props.onPress());
  expect(register).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Register')).toHaveLength(0);
});

test.each(['loading', 'connecting', 'disconnecting'] as const)('wallet %s shows a busy, locked action', async status => {
  jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), status, address: status === 'disconnecting' ? 'address11111111111111111111111111111111' : null });
  const renderer = await renderCard();
  const button = renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityHint?.includes('wallet'))[0]!;
  expect(button.props.disabled).toBe(true); expect(button.props.accessibilityState.busy).toBe(true);
  expect(connect).not.toHaveBeenCalled(); expect(disconnect).not.toHaveBeenCalled();
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('connected wallet can reveal its full selectable address', async () => {
  const address = '7YWHMfk9JZe0LMkM4fV2hT3sGVB7uW9vW7ZxLmqeZjAa';
  jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), status: 'connected', address });
  const renderer = await renderCard();
  await ReactTestRenderer.act(() => renderer.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Show full wallet address').props.onPress());
  const full = renderer.root.findAllByType(Text).find(node => node.props.children === address)!;
  expect(full.props.selectable).toBe(true); expect(connect).not.toHaveBeenCalled();
  await ReactTestRenderer.act(() => renderer.unmount());
});

async function renderCard() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SolanaWalletCard onRegister={register} />);
  });
  return renderer;
}
