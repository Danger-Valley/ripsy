"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import { StandardConnect, StandardDisconnect, type StandardConnectFeature, type StandardDisconnectFeature } from '@wallet-standard/features';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

const STORAGE_KEY = 'ripsy.wallet.v1';

type StoredWallet = { name: string; address: string };

export function useBrowserWallet() {
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [remembered, setRemembered] = useState<StoredWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const silentAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    const registry = getWallets();
    const update = () => setWallets(registry.get().filter(supportsSolanaConnect));
    update();
    const offRegister = registry.on('register', update);
    const offUnregister = registry.on('unregister', update);
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value) setRemembered(JSON.parse(value) as StoredWallet);
    } catch {}
    return () => { offRegister(); offUnregister(); };
  }, []);

  useEffect(() => {
    if (!remembered || wallet || busy) return;
    const matchingWallet = wallets.find(candidate => candidate.name === remembered.name);
    if (!matchingWallet) return;
    const attemptKey = `${remembered.name}:${remembered.address}`;
    if (silentAttemptRef.current === attemptKey) return;
    silentAttemptRef.current = attemptKey;
    setBusy(true);
    connectWallet(matchingWallet, true)
      .then(nextAccount => {
        if (!nextAccount) return;
        setWallet(matchingWallet);
        setAccount(nextAccount);
        persist(matchingWallet.name, nextAccount.address);
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [busy, remembered, wallet, wallets]);

  const connect = useCallback(async (selected: Wallet) => {
    setBusy(true);
    setError(null);
    try {
      const nextAccount = await connectWallet(selected, false);
      if (!nextAccount) throw new Error('The wallet did not provide a Solana account');
      setWallet(selected);
      setAccount(nextAccount);
      const stored = { name: selected.name, address: nextAccount.address };
      setRemembered(stored);
      persist(stored.name, stored.address);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect wallet');
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (wallet && hasDisconnect(wallet)) {
        const features = wallet.features as Wallet['features'] & StandardDisconnectFeature;
        await features[StandardDisconnect].disconnect();
      }
    } finally {
      localStorage.removeItem(STORAGE_KEY);
      silentAttemptRef.current = null;
      setWallet(null);
      setAccount(null);
      setRemembered(null);
      setBusy(false);
    }
  }, [wallet]);

  return useMemo(() => ({
    wallets,
    wallet,
    address: account?.address ?? remembered?.address ?? null,
    isConnected: Boolean(wallet && account),
    busy,
    error,
    connect,
    disconnect,
  }), [account, busy, connect, disconnect, error, remembered, wallet, wallets]);
}

function supportsSolanaConnect(wallet: Wallet): wallet is Wallet & StandardConnectFeature {
  return StandardConnect in wallet.features
    && wallet.chains.some(chain => chain.startsWith('solana:'));
}

async function connectWallet(wallet: Wallet, silent: boolean) {
  if (!supportsSolanaConnect(wallet)) return null;
  const features = wallet.features as Wallet['features'] & StandardConnectFeature;
  const result = await features[StandardConnect].connect({ silent });
  return result.accounts.find(account => account.chains.some(chain => chain.startsWith('solana:'))) ?? null;
}

function hasDisconnect(wallet: Wallet): wallet is Wallet & StandardDisconnectFeature {
  return StandardDisconnect in wallet.features;
}

function persist(name: string, address: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, address } satisfies StoredWallet));
}
