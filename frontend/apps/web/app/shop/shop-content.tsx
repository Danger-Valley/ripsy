"use client";

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePlayerIdentity } from '@rps/game-client';
import { useShop, type PurchaseStorage } from '@rps/game-client/use-shop';
import { formatSol, isTerminalMint, solanaExplorer, type MintOrder } from '@rps/core/shop';
import { useBrowserWallet } from '../hooks/use-browser-wallet';
import styles from './shop.module.css';

const storage: PurchaseStorage = {
  async load() { return localStorage.getItem('ripsy.shop.purchase.v1'); },
  async save(value) { if (value === null) localStorage.removeItem('ripsy.shop.purchase.v1'); else localStorage.setItem('ripsy.shop.purchase.v1', value); },
};
export interface EmbeddedWallet {
  ready: boolean; authenticated: boolean; address: string | null;
  login(): void; logout(): Promise<void>; createWallet(): Promise<void>;
  sign(order: MintOrder): Promise<string>;
}

export function ShopContent({ embedded }: { embedded?: EmbeddedWallet }) {
  const { sessionToken, error: sessionError } = usePlayerIdentity();
  const external = useBrowserWallet();
  const shop = useShop(process.env.NEXT_PUBLIC_SHOP_API_URL ?? 'https://api.ripsy.fun', sessionToken, storage);
  const [walletKind, setWalletKind] = useState<'external' | 'privy'>('external');
  const [walletMenu, setWalletMenu] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const address = walletKind === 'privy' ? embedded?.address : external.isConnected ? external.address : null;
  const order = shop.order;
  const error = actionError || shop.error || external.error || sessionError;
  const walletBusy = external.busy || shop.busy;
  const canClose = !shop.signingStarted || (order && isTerminalMint(order));
  const handle = (task: () => Promise<unknown>) => { setActionError(null); void task().catch(cause => setActionError(cause instanceof Error ? cause.message : 'Please try again.')); };
  const canConnect = !walletBusy;
  const canDisconnect = !shop.hasPurchase && !walletBusy;

  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/">← RIPSY</Link><span>FIGURE SHOP</span><span className={styles.network}>{shop.catalog?.cluster === 'mainnet-beta' ? 'Solana Mainnet' : 'Devnet · Test SOL'}</span></nav>
    <header className={styles.hero}><p className={styles.eyebrow}>THE FIGURE COLLECTION</p><h1>Make it yours.</h1><p>Same fighting spirit. Your own collectible.<br />Mint a RIPSY figure straight to your Solana wallet.</p></header>

    <section className={styles.wallet} aria-label="Choose your wallet">
      <div><p className={styles.eyebrow}>{address ? 'RECEIVING WALLET' : 'A HOME FOR YOUR FIGURES'}</p>
        {address ? <><strong>{walletKind === 'privy' ? 'Privy embedded wallet' : external.wallet?.name}</strong><p className={styles.address}>{address}</p></> : <><h2>Choose how to collect</h2><p>Connect your wallet, or sign in to create one with Privy.</p></>}
      </div>
      <div className={styles.actions}>
        {address && <button onClick={() => handle(() => navigator.clipboard.writeText(address))}>Copy address</button>}
        {address && <button disabled={!canDisconnect} onClick={() => handle(() => walletKind === 'privy' ? embedded!.logout() : external.disconnect())}>Disconnect</button>}
        <button disabled={!canConnect} onClick={() => { setWalletKind('external'); setWalletMenu(value => !value); }}>Connect wallet</button>
        {!embedded?.authenticated && <button disabled={!canConnect || !embedded?.ready} onClick={() => { setWalletKind('privy'); setWalletMenu(false); embedded?.login(); }}>{embedded ? 'Sign in with Privy' : 'Privy coming soon'}</button>}
        {embedded?.authenticated && !embedded.address && walletKind === 'privy' && <button onClick={() => handle(embedded.createWallet)}>Create embedded wallet</button>}
        {embedded?.address && walletKind !== 'privy' && <button disabled={!canConnect} onClick={() => setWalletKind('privy')}>Use Privy wallet</button>}
      </div>
      {walletMenu && <div className={styles.walletMenu}>{external.wallets.length ? external.wallets.map(wallet => <button key={wallet.name} disabled={walletBusy} onClick={() => handle(async () => { await external.connect(wallet); setWalletMenu(false); })}>{wallet.name}</button>) : <p>No Solana wallet detected. Open this page in your wallet browser or sign in with Privy.</p>}</div>}
    </section>

    {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={() => { setActionError(null); void (shop.hasPurchase ? shop.checkStatus() : shop.loadCatalog()); }}>Try again</button></div>}

    {shop.hasPurchase && <section className={styles.review} aria-label="Purchase review" aria-live="polite">
      <h2>{order?.status === 'confirmed' ? 'Your figure is ready!' : 'Your purchase'}</h2>
      {order ? <>
        <p>{order.status === 'confirmed' ? 'Confirmed on Solana. Your collectible is in your wallet.' : order.status === 'submitted' ? 'Confirming on Solana. You can return later; this purchase is saved.' : order.error ?? 'Check the details below, then approve the mint in your wallet.'}</p>
        {order.status === 'prepared' && address !== order.buyer && <p>Reconnect the receiving wallet shown below to approve this saved purchase. Its destination cannot be changed.</p>}
        <dl><dt>Figure</dt><dd>{order.figureId === 'fig1' ? 'Figure 01' : 'Figure 02'}</dd><dt>Price</dt><dd>{formatSol(order.priceLamports)}</dd><dt>Estimated network & mint fees</dt><dd>{formatSol(order.networkFeeLamports)}</dd><dt>Network</dt><dd>{order.cluster}</dd><dt>Receive collectible at</dt><dd className={styles.address}>{order.buyer}</dd><dt>Pay RIPSY at</dt><dd className={styles.address}>{order.treasury}</dd></dl>
        <div className={styles.actions}>
          {order.status === 'prepared' && <button className={styles.primary} disabled={shop.busy || address !== order.buyer} onClick={() => { void shop.confirm(walletKind === 'privy' ? embedded!.sign : external.signShopTransaction); }}>{shop.busy ? 'Waiting for wallet…' : shop.signingStarted ? 'Retry wallet approval' : 'Approve mint in wallet'}</button>}
          {order.signature && <a href={solanaExplorer('tx', order.signature, order.cluster)} target="_blank" rel="noreferrer">View transaction ↗</a>}
          {order.status === 'confirmed' && <a href={solanaExplorer('address', order.asset, order.cluster)} target="_blank" rel="noreferrer">View collectible ↗</a>}
          {order.status === 'confirmed' && <a href="/army">Add to your army →</a>}
        </div>
      </> : <p>Preparing your purchase. If the connection was interrupted, retry to recover this request.</p>}
      <div className={styles.actions}><button disabled={shop.busy} onClick={() => { void shop.checkStatus(); }}>Check status</button>{canClose && <button disabled={shop.busy} onClick={() => { void shop.dismiss(); }}>{order && isTerminalMint(order) ? 'Done' : 'Cancel purchase'}</button>}</div>
    </section>}

    <section className={styles.grid} aria-label="Available figures">
      {!shop.catalog && !error && [1].map(id => <div className={styles.skeleton} key={id} aria-label="Loading figure" />)}
      {shop.catalog?.figures.map(figure => <article className={styles.card} key={figure.id}>
        <div className={styles.art}><span className={styles.edition}>RIPSY ORIGINALS · {String(figure.variant).padStart(2, '0')}</span><Image src={`/figures/${figure.id}.png`} alt={figure.name} width={512} height={512} priority /></div>
        <div className={styles.cardCopy}><h2>{figure.name}</h2><p>{figure.description}</p>{figure.seekerExclusive && <strong className={styles.exclusive}>SOLANA SEEKER EXCLUSIVE</strong>}<div className={styles.price}><strong>{figure.priceLamports ? formatSol(figure.priceLamports) : 'Coming soon'}</strong><span>Metaplex Core</span></div>
          <button className={styles.primary} disabled={figure.seekerExclusive || !figure.available || !address || !shop.ready || shop.hasPurchase || shop.busy} onClick={() => { if (address) void shop.prepare(figure.id, address); }}>{!figure.available ? 'Minting opens soon' : figure.seekerExclusive ? 'Mint in the RIPSY Seeker app' : address ? 'Review mint →' : 'Connect a wallet to mint'}</button>
        </div>
      </article>)}
    </section>
    {shop.catalog?.figures.length === 0 && <p>New figures are on the way. Check back soon.</p>}
    <footer className={styles.footer}>One transaction for payment and mint. Network fees are extra.<br />After minting, choose which collectibles enter your army.</footer>
  </main>;
}
