import React from 'react';
import Renderer from 'react-test-renderer';
import { usePrivyWallet } from '../src/hooks/use-privy-wallet';
import { nativePrivyWallet } from '../src/native-privy-wallet';
import type { PurchaseTransaction, WalletChallenge } from '@rps/core/shop';

jest.mock('../src/native-privy-wallet', () => ({ nativePrivyWallet: {
  getState: jest.fn(), sendEmailCode: jest.fn(), loginWithEmailCode: jest.fn(),
  createWallet: jest.fn(), logout: jest.fn(), signTransaction: jest.fn(), signMessage: jest.fn(),
} }));

let account!: ReturnType<typeof usePrivyWallet>;
let tree: Renderer.ReactTestRenderer;
function Probe({ enabled }: { enabled: boolean }) { account = usePrivyWallet(enabled); return null; }
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(nativePrivyWallet.getState).mockResolvedValue({ configured: true, status: 'authenticated', address: 'buyer', userId: 'user' });
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); });

test('disabled email account never restores or invokes the native SDK', async () => {
  await Renderer.act(() => { tree = Renderer.create(<Probe enabled={false} />); });
  await Renderer.act(() => account.refresh());
  await Renderer.act(() => account.disconnect());
  await expect(account.sendCode('you@example.com')).rejects.toThrow('Connect your Seeker wallet');
  await expect(account.verifyCode('you@example.com', '123456')).rejects.toThrow('Connect your Seeker wallet');
  await expect(account.createWallet()).rejects.toThrow('Connect your Seeker wallet');
  await expect(account.signShopTransaction({ buyer: 'buyer' } as PurchaseTransaction)).rejects.toThrow('Connect your Seeker wallet');
  await expect(account.proveWallet({} as WalletChallenge)).rejects.toThrow('Connect your Seeker wallet');
  expect(account.address).toBeNull(); expect(account.error).toBeNull(); expect(account.busy).toBe(false);
  for (const method of Object.values(nativePrivyWallet)) expect(method).not.toHaveBeenCalled();
});

test('ordinary devices still restore email accounts, but disabled mode hides a previously loaded account', async () => {
  await Renderer.act(async () => { tree = Renderer.create(<Probe enabled />); });
  expect(nativePrivyWallet.getState).toHaveBeenCalledTimes(1);
  expect(account.address).toBe('buyer');
  await Renderer.act(() => tree.update(<Probe enabled={false} />));
  expect(account.address).toBeNull(); expect(account.codeSent).toBe(false);
  await Renderer.act(() => account.refresh());
  expect(nativePrivyWallet.getState).toHaveBeenCalledTimes(1);
});
