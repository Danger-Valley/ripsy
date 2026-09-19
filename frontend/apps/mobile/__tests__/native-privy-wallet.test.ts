import { NativeModules } from 'react-native';
import { nativePrivyWallet } from '../src/native-privy-wallet';

describe('nativePrivyWallet', () => {
  afterEach(() => {
    delete NativeModules.PrivyWallet;
  });

  it('forwards signing to native code without changing the serialized transaction', async () => {
    const signTransaction = jest.fn().mockResolvedValue('fully-signed-base64');
    NativeModules.PrivyWallet = { signTransaction };

    await expect(nativePrivyWallet.signTransaction('server-transaction-base64', 'buyer-address'))
      .resolves.toBe('fully-signed-base64');
    expect(signTransaction).toHaveBeenCalledWith('server-transaction-base64', 'buyer-address');
  });

  it('fails closed when the native SDK is not linked', () => {
    expect(() => nativePrivyWallet.getState()).toThrow(
      'Privy embedded wallet is not available in this build.',
    );
  });
});
