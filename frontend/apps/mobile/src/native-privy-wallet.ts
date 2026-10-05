import { NativeModules } from 'react-native';
import { figureStoreMessage } from '@rps/core/shop';

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
    throw new Error('Sign in with email is unavailable in this build.');
  }
  return nativeModule;
}

async function request<T>(operation: () => Promise<T>, fallback: string): Promise<T> {
  try { return await operation(); }
  catch (cause) {
    const message = figureStoreMessage(cause instanceof Error ? cause.message : null, fallback);
    throw new Error(message);
  }
}

export const nativePrivyWallet = {
  getState: () => request(() => module().getState(), 'Sign in with email is unavailable. Please try again.'),
  sendEmailCode: (email: string) => request(() => module().sendEmailCode(email), 'Could not send the sign-in code. Please try again.'),
  loginWithEmailCode: (email: string, code: string) => request(() => module().loginWithEmailCode(email, code), 'Could not sign in with email. Check your code and try again.'),
  createWallet: () => request(() => module().createWallet(), 'Could not finish registration. Please try again.'),
  logout: () => request(() => module().logout(), 'Could not sign out. Please try again.'),
  signMessage: (message: string, buyer: string) => request(() => module().signMessage(message, buyer), 'Could not verify your collection. Please try again.'),
  signTransaction: (transactionBase64: string, buyer: string) =>
    request(() => module().signTransaction(transactionBase64, buyer), 'Could not approve this purchase. Please try again.'),
};
