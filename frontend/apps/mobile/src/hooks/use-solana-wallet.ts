import { useCallback, useEffect, useState } from 'react';
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getSolanaWalletErrorMessage,
  isSolanaWalletSupported,
} from '../solana-wallet-adapter';
import {
  clearSolanaWalletSession,
  loadSolanaWalletSession,
  saveSolanaWalletSession,
  subscribeSolanaWallet,
  type SolanaWalletSession,
} from '../storage/solana-wallet-session';

export type SolanaWalletStatus = 'loading' | 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export function useSolanaWallet() {
  const [session, setSession] = useState<SolanaWalletSession | null>(null);
  const [status, setStatus] = useState<SolanaWalletStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeSolanaWallet(nextSession => {
      setSession(nextSession);
      setStatus(nextSession ? 'connected' : 'disconnected');
    });
    loadSolanaWalletSession()
      .then(storedSession => {
        if (!active) return;
        setSession(storedSession);
        setStatus(storedSession ? 'connected' : 'disconnected');
      })
      .catch(() => {
        if (!active) return;
        setStatus('disconnected');
        setError('Could not restore the saved wallet.');
      });
    return () => { active = false; unsubscribe(); };
  }, []);

  const connect = useCallback(async (expectedAddress?: string) => {
    if (!isSolanaWalletSupported || status === 'connecting' || status === 'disconnecting') return;
    setStatus('connecting');
    setError(null);
    try {
      const nextSession = expectedAddress ? await connectSolanaWallet(session, expectedAddress) : await connectSolanaWallet(session);
      await saveSolanaWalletSession(nextSession);
      setSession(nextSession);
      setStatus('connected');
    } catch (cause) {
      setStatus(session ? 'connected' : 'disconnected');
      setError(getSolanaWalletErrorMessage(cause));
    }
  }, [session, status]);

  const disconnect = useCallback(async () => {
    if (!session || status === 'connecting' || status === 'disconnecting') return;
    setStatus('disconnecting');
    setError(null);
    try {
      await disconnectSolanaWallet(session);
    } catch {
      // A stale or unavailable wallet must not prevent local disconnect.
    } finally {
      try {
        await clearSolanaWalletSession();
        setSession(null);
        setStatus('disconnected');
      } catch {
        setStatus('connected');
        setError('Could not forget the wallet on this device. Try again.');
      }
    }
  }, [session, status]);

  return {
    address: isSolanaWalletSupported ? session?.address ?? null : null,
    label: isSolanaWalletSupported ? session?.label ?? null : null,
    status,
    error,
    isSupported: isSolanaWalletSupported,
    connect,
    disconnect,
  };
}
