import { useCallback, useEffect, useState } from 'react';
import type { PurchaseTransaction, WalletChallenge, WalletProof } from '@rps/core/shop';
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

export function usePrivyWallet(enabled = true) {
  const [state, setState] = useState<PrivyWalletState>(initialState);
  const [activity, setActivity] = useState<PrivyWalletActivity>('loading');
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    try {
      setState(await nativePrivyWallet.getState());
    } catch (cause) {
      setState({ ...initialState, configured: false, status: 'unavailable' });
      setError(message(cause, 'Sign in with email is unavailable in this build.'));
    } finally {
      setActivity('idle');
    }
  }, [enabled]);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const sendCode = useCallback(async (email: string) => {
    if (!enabled) throw new Error('Connect your Seeker wallet to continue.');
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
  }, [enabled]);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!enabled) throw new Error('Connect your Seeker wallet to continue.');
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
  }, [enabled]);

  const createWallet = useCallback(async () => {
    if (!enabled) throw new Error('Connect your Seeker wallet to continue.');
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
  }, [enabled]);

  const disconnect = useCallback(async () => {
    if (!enabled) return;
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
  }, [enabled]);

  const signShopTransaction = useCallback(async (order: PurchaseTransaction) => {
    if (!enabled) throw new Error('Connect your Seeker wallet to continue.');
    if (!state.address || state.address !== order.buyer) {
      throw new Error('Reconnect the embedded wallet selected for this purchase.');
    }
    return nativePrivyWallet.signTransaction(order.transaction, order.buyer);
  }, [enabled, state.address]);

  const proveWallet = useCallback(async (challenge: WalletChallenge): Promise<WalletProof> => {
    if (!enabled) throw new Error('Connect your Seeker wallet to continue.');
    if (!state.address) throw new Error('Sign in to your embedded wallet first.');
    const messageText = createSignInMessageText({ ...challenge, address: state.address });
    const signature = decodeBase64(await nativePrivyWallet.signMessage(messageText, state.address));
    return {
      address: state.address,
      nonce: challenge.nonce,
      signature: Array.from(signature),
      signedMessage: Array.from(new TextEncoder().encode(messageText)),
    };
  }, [enabled, state.address]);

  return {
    ...(enabled ? state : { ...initialState, configured: false, status: 'unavailable' as const }),
    activity: enabled ? activity : 'idle' as const,
    busy: enabled && activity !== 'idle',
    error: enabled ? error : null,
    codeSent: enabled && codeSent,
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
