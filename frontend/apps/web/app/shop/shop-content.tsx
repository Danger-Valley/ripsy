"use client";

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePlayerIdentity } from '@rps/game-client';
import { useShop, type PurchaseStorage } from '@rps/game-client/use-shop';
import { DEFAULT_SOLANA_MOBILE_STORE_URL, figurePrice, figureStoreMessage, isTerminalMint, solanaExplorer, type MintOrder } from '@rps/core/shop';
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
  const canDisconnect = shop.ready && !shop.hasPurchase && !walletBusy;
  const disconnectWallet = async () => {
    await shop.clearWallet();
    localStorage.removeItem('ripsy.figure-loadout.v1');
    if (walletKind === 'privy') await embedded!.logout();
    else await external.disconnect();
  };

  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/">← RIPSY</Link><span>FIGURE SHOP</span>{shop.catalog?.cluster === 'devnet' && <span className={styles.network}>Test mode · No real purchases</span>}</nav>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>THE FIGURE COLLECTION</p><h1>Make it yours.</h1><p>Same fighting spirit. Your own figure.<br />Buy a fighter and add it to your army.</p></div>
      <div className={styles.heroChest} aria-hidden><span>★</span><Image src="/figures/fig2.png" alt="" width={190} height={190} priority /></div>
    </header>

    <section className={styles.wallet} aria-label="Your purchase account">
      <div><p className={styles.eyebrow}>{address ? 'YOUR ACCOUNT' : 'A HOME FOR YOUR FIGURES'}</p>
        {address ? <><strong>{walletKind === 'privy' ? 'Signed in with email' : external.wallet?.name}</strong>{walletKind !== 'privy' && <p className={styles.address}>{address.slice(0, 4)}…{address.slice(-4)}</p>}</> : <><h2>Choose how to collect</h2><p>Connect your wallet, or sign in with email.</p></>}
      </div>
      <div className={styles.actions}>
        {address && walletKind !== 'privy' && <button onClick={() => handle(() => navigator.clipboard.writeText(address))}>Copy account ID</button>}
        {address && <button disabled={!canDisconnect} onClick={() => handle(disconnectWallet)}>{walletKind === 'privy' ? 'Sign out' : 'Disconnect'}</button>}
        <button disabled={!canConnect} onClick={() => { setWalletKind('external'); setWalletMenu(value => !value); }}>Connect wallet</button>
        {!embedded?.authenticated && <button disabled={!canConnect || !embedded?.ready} onClick={() => { setWalletKind('privy'); setWalletMenu(false); embedded?.login(); }}>{embedded ? 'Sign in with email' : 'Email sign-in unavailable'}</button>}
        {embedded?.authenticated && !embedded.address && walletKind === 'privy' && <button onClick={() => handle(embedded.createWallet)}>Finish registration</button>}
        {embedded?.address && walletKind !== 'privy' && <button disabled={!canConnect} onClick={() => setWalletKind('privy')}>Use email account</button>}
      </div>
      {walletMenu && <div className={styles.walletMenu}>{external.wallets.length ? external.wallets.map(wallet => <button key={wallet.name} disabled={walletBusy} onClick={() => handle(async () => { await external.connect(wallet); setWalletMenu(false); })}>{wallet.name}</button>) : <p>No supported purchase account detected. You can sign in with email.</p>}</div>}
    </section>

    {error && <div className={styles.error} role="alert"><p>{figureStoreMessage(error)}</p><button onClick={() => { setActionError(null); void (shop.hasPurchase ? shop.checkStatus() : shop.loadCatalog()); }}>Try again</button></div>}

    {shop.hasPurchase && <section className={styles.review} aria-label="Purchase review" aria-live="polite">
      <h2>{order?.status === 'confirmed' ? 'Your figure is ready!' : 'Your purchase'}</h2>
      {order ? <>
        <p>{order.status === 'confirmed' ? 'Purchase complete. Your figure is in your collection.' : order.status === 'submitted' ? 'Processing your purchase. You can return later; this purchase is saved.' : order.status === 'failed' ? figureStoreMessage(order.error, 'The purchase failed. Check its status before trying again.') : order.status === 'expired' ? 'This purchase expired. Close it to start again.' : order.error ? figureStoreMessage(order.error) : 'Review the total below. Nothing is purchased until you approve.'}</p>
        {order.status === 'prepared' && address !== order.buyer && <p>Sign in to the purchase account to approve this saved order. Its destination cannot be changed.</p>}
        {order.cluster === 'devnet' && <p>Test purchase only. No real payment.</p>}
        <dl><dt>Figure</dt><dd>{order.figureId === 'fig1' ? 'RIPSY 001' : 'Seeker fighter'}</dd><dt>Price</dt><dd>{figurePrice(order.priceLamports, order.cluster)}</dd><dt>Estimated additional fees</dt><dd>{figurePrice(order.networkFeeLamports, order.cluster)}</dd><dt>Estimated total</dt><dd>{figurePrice((BigInt(order.priceLamports) + BigInt(order.networkFeeLamports)).toString(), order.cluster)}</dd><dt>Sold by</dt><dd>RIPSY</dd></dl>
        <details><summary>Payment details</summary><dl><dt>Purchase account</dt><dd className={styles.address}>{order.buyer}</dd><dt>Seller account</dt><dd className={styles.address}>{order.treasury}</dd></dl>{order.signature && <a href={solanaExplorer('tx', order.signature, order.cluster)} target="_blank" rel="noreferrer">View payment record ↗</a>}</details>
        <div className={styles.actions}>
          {order.status === 'prepared' && <button className={styles.primary} disabled={shop.busy || address !== order.buyer} onClick={() => { void shop.confirm(walletKind === 'privy' ? embedded!.sign : external.signShopTransaction); }}>{shop.busy ? 'Waiting for approval…' : shop.signingStarted ? 'Retry purchase approval' : 'Confirm purchase'}</button>}
          {order.status === 'confirmed' && <a href={`/army?minted=${encodeURIComponent(order.asset)}`}>Add to your army →</a>}
        </div>
      </> : <p>Preparing your purchase. If the connection was interrupted, retry to recover this request.</p>}
      <div className={styles.actions}><button disabled={shop.busy} onClick={() => { void shop.checkStatus(); }}>Check status</button>{canClose && <button disabled={shop.busy} onClick={() => { void shop.dismiss(); }}>{order && isTerminalMint(order) ? 'Done' : 'Cancel purchase'}</button>}</div>
    </section>}

    <section className={styles.grid} aria-label="Available figures">
      {!shop.catalog && !error && [1].map(id => <div className={styles.skeleton} key={id} aria-label="Loading figure" />)}
      {shop.catalog?.figures.map(figure => <article className={styles.card} key={figure.id}>
        <div className={styles.art}><span className={styles.edition}>RIPSY ORIGINALS · {String(figure.variant).padStart(2, '0')}</span><Image src={`/figures/${figure.id}.png`} alt={figure.name} width={512} height={512} priority /></div>
        <div className={styles.cardCopy}><h2>{figure.name}</h2><p>{figure.description}</p>{figure.seekerExclusive && <strong className={styles.exclusive}>SEEKER EXCLUSIVE</strong>}<div className={styles.price}><strong>{figure.priceLamports ? figurePrice(figure.priceLamports, shop.catalog!.cluster) : 'Coming soon'}</strong></div>
          {figure.seekerExclusive ? <a className={styles.primary} href={shop.catalog?.solanaMobileStoreUrl ?? DEFAULT_SOLANA_MOBILE_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Solana Mobile Exclusive">Solana Mobile Exclusive</a> : <button className={styles.primary} disabled={!figure.available || !address || !shop.ready || shop.hasPurchase || shop.busy} onClick={() => { if (address) void shop.prepare(figure.id, address); }}>{!figure.available ? 'Purchases coming soon' : address ? 'Buy figure' : 'Sign in to buy figures'}</button>}
        </div>
      </article>)}
    </section>
    {shop.catalog?.figures.length === 0 && <p>New figures are on the way. Check back soon.</p>}
    <footer className={styles.footer}>Review the total before you buy.<br />Choose which figures enter your army. Each figure fills one slot.</footer>
  </main>;
}
