"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { useBrowserWallet } from '../hooks/use-browser-wallet';
import styles from '../page.module.css';

export function WalletCard() {
  const wallet = useBrowserWallet();
  const [open, setOpen] = useState(false);

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
            <button className={styles.iconButton} disabled={wallet.busy} onClick={() => wallet.disconnect()}>Disconnect</button>
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
