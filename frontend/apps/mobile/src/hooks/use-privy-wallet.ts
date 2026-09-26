import { useCallback, useEffect, useState } from 'react';
import type { MintOrder, WalletChallenge, WalletProof } from '@rps/core/shop';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { nativePrivyWallet, type PrivyWalletState } from '../native-privy-wallet';

const initialState: PrivyWalletState = {
  configured: true,
  status: 'unauthenticated',
  address: null,
  userId: null,
};

export type PrivyWalletActivity =
  | 'loading'
  | 'idle'
  | 'sending-code'
  | 'verifying-code'
  | 'creating-wallet'
  | 'disconnecting';

export function usePrivyWallet() {
  const [state, setState] = useState<PrivyWalletState>(initialState);
  const [activity, setActivity] = useState<PrivyWalletActivity>('loading');
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setState(await nativePrivyWallet.getState());
    } catch (cause) {
      setState({ ...initialState, configured: false, status: 'unavailable' });
      setError(message(cause, 'Privy embedded wallet is not available in this build.'));
    } finally {
      setActivity('idle');
    }
  }, []);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const sendCode = useCallback(async (email: string) => {
    setActivity('sending-code');
    setError(null);
    try {
      await nativePrivyWallet.sendEmailCode(email.trim());
      setCodeSent(true);
    } catch (cause) {
      setError(message(cause, 'Could not send the sign-in code.'));
      throw cause;
    } finally {
      setActivity('idle');
    }
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    setActivity('verifying-code');
    setError(null);
    try {
      let next = await nativePrivyWallet.loginWithEmailCode(email.trim(), code.trim());
      if (next.status === 'authenticated' && !next.address) {
        setActivity('creating-wallet');
        next = await nativePrivyWallet.createWallet();
      }
      setState(next);
      setCodeSent(false);
    } catch (cause) {
      setError(message(cause, 'Could not verify the sign-in code.'));
      throw cause;
    } finally {
      setActivity('idle');
    }
  }, []);

  const createWallet = useCallback(async () => {
    setActivity('creating-wallet');
    setError(null);
    try {
      setState(await nativePrivyWallet.createWallet());
    } catch (cause) {
      setError(message(cause, 'Could not create your embedded wallet.'));
      throw cause;
    } finally {
      setActivity('idle');
    }
  }, []);

  const disconnect = useCallback(async () => {
    setActivity('disconnecting');
    setError(null);
    try {
      setState(await nativePrivyWallet.logout());
      setCodeSent(false);
    } catch (cause) {
      setError(message(cause, 'Could not disconnect the embedded wallet.'));
      throw cause;
    } finally {
      setActivity('idle');
    }
  }, []);

  const signShopTransaction = useCallback(async (order: MintOrder) => {
    if (!state.address || state.address !== order.buyer) {
      throw new Error('Reconnect the embedded wallet selected for this purchase.');
    }
    return nativePrivyWallet.signTransaction(order.transaction, order.buyer);
  }, [state.address]);

  const proveWallet = useCallback(async (challenge: WalletChallenge): Promise<WalletProof> => {
    if (!state.address) throw new Error('Sign in to your embedded wallet first.');
    const messageText = createSignInMessageText({ ...challenge, address: state.address });
    const signature = decodeBase64(await nativePrivyWallet.signMessage(messageText, state.address));
    return {
      address: state.address,
      nonce: challenge.nonce,
      signature: Array.from(signature),
      signedMessage: Array.from(new TextEncoder().encode(messageText)),
    };
  }, [state.address]);

  return {
    ...state,
    activity,
    busy: activity !== 'idle',
    error,
    codeSent,
    refresh,
    sendCode,
    verifyCode,
    createWallet,
    disconnect,
    signShopTransaction,
    proveWallet,
  };
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
