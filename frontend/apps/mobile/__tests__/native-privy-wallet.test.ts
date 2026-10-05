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

  it('forwards wallet proof messages to native code unchanged', async () => {
    const signMessage = jest.fn().mockResolvedValue('signature-base64');
    NativeModules.PrivyWallet = { signMessage };

    await expect(nativePrivyWallet.signMessage('verify this exact message', 'buyer-address'))
      .resolves.toBe('signature-base64');
    expect(signMessage).toHaveBeenCalledWith('verify this exact message', 'buyer-address');
  });

  it('fails closed when the native SDK is not linked', async () => {
    await expect(nativePrivyWallet.getState()).rejects.toThrow(
      'Sign in with email is unavailable in this build.',
    );
  });

  it('does not expose provider branding in native authentication errors', async () => {
    NativeModules.PrivyWallet = { sendEmailCode: jest.fn().mockRejectedValue(new Error('Privy SDK failed')) };
    await expect(nativePrivyWallet.sendEmailCode('user@example.test')).rejects.toThrow('Could not send the sign-in code. Please try again.');
  });
});
