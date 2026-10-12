"use client";

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePlayerIdentity } from '@rps/game-client';
import { ShopClient } from '@rps/game-client/shop';
import { useBrowserWallet } from '../hooks/use-browser-wallet';
import styles from '../page.module.css';

export function WalletCard() {
  const wallet = useBrowserWallet();
  const { sessionToken } = usePlayerIdentity();
  const client = useMemo(() => new ShopClient(process.env.NEXT_PUBLIC_SHOP_API_URL ?? 'https://api.ripsy.fun', sessionToken), [sessionToken]);
  const [open, setOpen] = useState(false);
  const disconnect = async () => {
    try {
      await client.clearWallet();
      localStorage.removeItem('ripsy.figure-loadout.v1');
      localStorage.removeItem('ripsy.figure-variants.v1');
      await wallet.disconnect();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not disconnect wallet');
    }
  };

  if (wallet.address) {
    return (
      <section className={styles.walletCard} aria-label="Solana wallet">
        <div className={styles.walletIdentity}>
          <span className={styles.walletDot} />
          <div>
            <span className={styles.eyebrow}>{wallet.isConnected ? 'SOLANA WALLET' : 'LAST WALLET'}</span>
            <strong>{shortAddress(wallet.address)}</strong>
          </div>
        </div>
        <div className={styles.walletActions}>
          <button className={styles.iconButton} onClick={() => navigator.clipboard.writeText(wallet.address!).then(() => toast.success('Address copied'))}>Copy</button>
          {wallet.isConnected ? (
            <button className={styles.iconButton} disabled={wallet.busy || !sessionToken} onClick={() => void disconnect()}>Disconnect</button>
          ) : (
            <button className={styles.iconButton} disabled={wallet.busy} onClick={() => setOpen(true)}>Reconnect</button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.walletCard} aria-label="Solana wallet">
      <div>
        <span className={styles.eyebrow}>SOLANA MOBILE</span>
        <strong className={styles.walletTitle}>Connect wallet</strong>
        <p className={styles.walletCopy}>Optional identity for Solana features. Gameplay stays off-chain.</p>
      </div>
      <button className={styles.iconButton} onClick={() => setOpen(value => !value)}>Connect</button>
      {open && (
        <div className={styles.walletMenu}>
          {wallet.wallets.length ? wallet.wallets.map(candidate => (
            <button key={candidate.name} disabled={wallet.busy} onClick={() => wallet.connect(candidate).then(() => setOpen(false)).catch(() => undefined)}>
              {candidate.name}
            </button>
          )) : <p>No compatible browser wallet found.</p>}
        </div>
      )}
      {wallet.error && <p className={styles.inlineError}>{wallet.error}</p>}
    </section>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}
