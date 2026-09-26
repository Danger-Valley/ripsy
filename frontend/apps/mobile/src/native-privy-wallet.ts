import { NativeModules } from 'react-native';

export type PrivyWalletStatus =
  | 'unavailable'
  | 'unauthenticated'
  | 'authenticated-unverified'
  | 'authenticated';

export interface PrivyWalletState {
  configured: boolean;
  status: PrivyWalletStatus;
  address: string | null;
  userId: string | null;
}

interface PrivyWalletNativeModule {
  getState(): Promise<PrivyWalletState>;
  sendEmailCode(email: string): Promise<void>;
  loginWithEmailCode(email: string, code: string): Promise<PrivyWalletState>;
  createWallet(): Promise<PrivyWalletState>;
  logout(): Promise<PrivyWalletState>;
  signMessage(message: string, buyer: string): Promise<string>;
  signTransaction(transactionBase64: string, buyer: string): Promise<string>;
}

function module(): PrivyWalletNativeModule {
  const nativeModule = NativeModules.PrivyWallet as PrivyWalletNativeModule | undefined;
  if (!nativeModule) {
    throw new Error('Privy embedded wallet is not available in this build.');
  }
  return nativeModule;
}

export const nativePrivyWallet = {
  getState: () => module().getState(),
  sendEmailCode: (email: string) => module().sendEmailCode(email),
  loginWithEmailCode: (email: string, code: string) => module().loginWithEmailCode(email, code),
  createWallet: () => module().createWallet(),
  logout: () => module().logout(),
  signMessage: (message: string, buyer: string) => module().signMessage(message, buyer),
  signTransaction: (transactionBase64: string, buyer: string) =>
    module().signTransaction(transactionBase64, buyer),
};
