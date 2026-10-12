"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePlayerIdentity } from '@rps/game-client';
import { ShopClient, ShopRequestError } from '@rps/game-client/shop';
import { FIGURE_SLOTS, figureAssetVariants, figureStoreMessage, type FigureInventory, type OwnedFigureAsset, type WalletChallenge, type WalletProof } from '@rps/core/shop';
import { useBrowserWallet } from '../hooks/use-browser-wallet';
import { FIGURE_INVENTORY_REFRESH_MS, retainOwnedFigureSlots } from './inventory-sync';
import styles from './army.module.css';

export interface EmbeddedArmyWallet {
  ready: boolean;
  authenticated: boolean;
  address: string | null;
  login(): void;
  logout(): Promise<void>;
  createWallet(): Promise<void>;
  proveWallet(challenge: WalletChallenge): Promise<WalletProof>;
}

export function ArmyContent({ embedded }: { embedded?: EmbeddedArmyWallet }) {
  const { sessionToken } = usePlayerIdentity();
  const external = useBrowserWallet();
  const client = useMemo(() => new ShopClient(process.env.NEXT_PUBLIC_SHOP_API_URL ?? 'https://api.ripsy.fun', sessionToken), [sessionToken]);
  const [walletKind, setWalletKind] = useState<'external' | 'privy'>('external');
  const [walletMenu, setWalletMenu] = useState(false);
  const [inventory, setInventory] = useState<FigureInventory | null>(null);
  const [slots, setSlots] = useState<Array<string | null>>(Array(FIGURE_SLOTS).fill(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [needsWalletProof, setNeedsWalletProof] = useState(false);
  const [expectedAssetId, setExpectedAssetId] = useState<string | null>(null);
  const [indexingChecks, setIndexingChecks] = useState(0);
  const refreshInFlight = useRef(false);
  const proofAttempt = useRef<string | null>(null);
  const address = walletKind === 'privy' ? embedded?.address ?? null : external.isConnected ? external.address : null;
  const isWaitingForMint = Boolean(expectedAssetId && inventory && !inventory.assets.some(asset => asset.assetId === expectedAssetId));

  const storeInventory = useCallback((next: FigureInventory, preserveDraft = false) => {
    setInventory(next);
    setSlots(current => preserveDraft
      ? retainOwnedFigureSlots(current, next.assets)
      : next.slots);
    localStorage.setItem('ripsy.figure-loadout.v1', JSON.stringify(next.slots));
    localStorage.setItem('ripsy.figure-variants.v1', JSON.stringify(figureAssetVariants(next.assets)));
  }, []);

  const load = useCallback(async (verify = false, background = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!background) { setBusy(true); setError(null); setSaved(false); }
    try {
      if (verify) {
        if (!address) throw new Error('Connect a wallet before loading your figures.');
        const challenge = await client.walletChallenge();
        const proof = walletKind === 'privy' ? await embedded!.proveWallet(challenge) : await external.proveWallet(challenge);
        await client.verifyWallet(proof);
      }
      const next = await client.inventory();
      storeInventory(next, background);
      setNeedsWalletProof(false);
    } catch (cause) {
      if (cause instanceof ShopRequestError && cause.status === 403 && !verify) {
        setNeedsWalletProof(true);
        if (!background) setError(null);
      } else if (!background) {
        setError(cause instanceof Error ? cause.message : 'Could not load your figures.');
      }
    } finally {
      refreshInFlight.current = false;
      if (!background) setBusy(false);
    }
  }, [address, client, embedded, external.proveWallet, storeInventory, walletKind]);

  useEffect(() => {
    setExpectedAssetId(new URLSearchParams(window.location.search).get('minted'));
  }, []);
  useEffect(() => { if (sessionToken) void load(false); }, [sessionToken, load]);
  useEffect(() => {
    if (!needsWalletProof || !address || !sessionToken || busy) return;
    const attempt = `${walletKind}:${address}`;
    if (proofAttempt.current === attempt) return;
    proofAttempt.current = attempt;
    void load(true);
  }, [address, busy, load, needsWalletProof, sessionToken, walletKind]);
  useEffect(() => {
    if (!inventory || !sessionToken) return;
    const refresh = () => { if (!document.hidden) void load(false, true); };
    const timer = window.setInterval(refresh, FIGURE_INVENTORY_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [inventory, load, sessionToken]);
  useEffect(() => {
    if (!isWaitingForMint || busy || indexingChecks >= 10) return;
    const timer = window.setTimeout(() => {
      load(false, true).finally(() => setIndexingChecks(current => current + 1));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [busy, indexingChecks, isWaitingForMint]); // eslint-disable-line react-hooks/exhaustive-deps
  const equipped = new Set(slots.filter((value): value is string => Boolean(value)));
  const toggle = (asset: OwnedFigureAsset) => {
    setSaved(false);
    setSlots(current => {
      const existing = current.indexOf(asset.assetId);
      if (existing >= 0) return current.map((value, index) => index === existing ? null : value);
      const empty = current.indexOf(null);
      return empty < 0 ? current : current.map((value, index) => index === empty ? asset.assetId : value);
    });
  };
  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const next = await client.saveLoadout(slots);
      storeInventory(next);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your army.'); }
    finally { setBusy(false); }
  };
  const disconnectCollectionWallet = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const connectedAddress = inventory?.wallet;
      await client.clearWallet();
      localStorage.removeItem('ripsy.figure-loadout.v1');
      localStorage.removeItem('ripsy.figure-variants.v1');
      setSlots(Array<string | null>(FIGURE_SLOTS).fill(null)); setInventory(null);
      setNeedsWalletProof(true);
      proofAttempt.current = null;
      if (connectedAddress && connectedAddress === external.address) await external.disconnect();
      if (connectedAddress && connectedAddress === embedded?.address) await embedded.logout();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not disconnect your collection wallet.'); }
    finally { setBusy(false); }
  };

  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/app">← PLAYGROUND</Link><span>YOUR ARMY</span><Link href="/shop">Figure shop →</Link></nav>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>14 SLOTS · YOUR COLLECTION</p><h1>Choose your fighters.</h1><p>RIPSY 001 is free and fills every empty slot. Each figure in your collection fills one slot.</p></div>
      <div className={styles.heroFigures} aria-hidden><Image src="/figures/fig1.png" alt="" width={180} height={180} priority /><Image src="/figures/fig2.png" alt="" width={180} height={180} priority /></div>
    </header>

    {!inventory && <section className={styles.panel} aria-busy={busy}>
      <h2>{needsWalletProof ? 'Connect your collection' : 'Opening your army…'}</h2>
      <p>{needsWalletProof ? 'Connect once and RIPSY will keep your figures in sync until you disconnect.' : 'Checking your saved fighters and collection.'}</p>
      <div className={styles.actions}>
        {needsWalletProof && <button disabled={busy} onClick={() => { setWalletKind('external'); setWalletMenu(value => !value); }}>Connect wallet</button>}
        {needsWalletProof && !embedded?.authenticated && <button disabled={busy || !embedded?.ready} onClick={() => { setWalletKind('privy'); embedded?.login(); }}>Sign in with email</button>}
        {needsWalletProof && embedded?.authenticated && !embedded.address && <button disabled={busy} onClick={() => void embedded.createWallet()}>Finish registration</button>}
        {needsWalletProof && embedded?.address && <button disabled={busy} onClick={() => setWalletKind('privy')}>Use email account</button>}
      </div>
      {walletMenu && <div className={styles.walletMenu}>{external.wallets.length ? external.wallets.map(wallet => <button key={wallet.name} onClick={() => { void external.connect(wallet).then(() => setWalletMenu(false)); }}>{wallet.name}</button>) : <p>No supported purchase account detected. You can sign in with email.</p>}</div>}
    </section>}

    {error && <div className={styles.error} role="alert"><p>{figureStoreMessage(error, 'Could not load your collection. Please try again.')}</p><button onClick={() => { proofAttempt.current = null; void load(needsWalletProof && Boolean(address)); }}>Try again</button></div>}
    {saved && <div className={styles.success} role="status">Army saved. New lineups will use these figures.</div>}
    {isWaitingForMint && <div className={styles.success} role="status">{indexingChecks < 10 ? 'Purchase complete. Your new figure will appear shortly…' : 'Purchase complete. Your collection is updating. Refresh in a moment.'}</div>}

    {inventory && <div className={styles.columns}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>ACTIVE SLOTS</p><h2>{equipped.size} collectible{equipped.size === 1 ? '' : 's'} · {FIGURE_SLOTS - equipped.size} free</h2></div></div>
        <div className={styles.slots} aria-label="Fourteen army slots">{slots.map((assetId, index) => <button disabled={!assetId} className={assetId ? styles.collectibleSlot : styles.freeSlot} key={`${index}-${assetId ?? 'free'}`} onClick={() => { const asset = inventory.assets.find(candidate => candidate.assetId === assetId); if (asset) toggle(asset); }} aria-label={`Slot ${index + 1}: ${assetId ? inventory?.assets.find(asset => asset.assetId === assetId)?.name ?? 'Collectible fighter' : 'free RIPSY 001'}`}><span>{index + 1}</span><Image unoptimized src={inventory.assets.find(asset => asset.assetId === assetId)?.imageUrl ?? '/figures/fig1.png'} alt="" width={96} height={96} /></button>)}</div>
      </section>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>YOUR COLLECTIBLES</p>
        {inventory.assets.length === 0 ? <div className={styles.empty}><h2>No collectible figures yet</h2><p>Your army still has 14 free RIPSY 001 fighters. Discover more fighters in the shop.</p><Link href="/shop">Open figure shop →</Link></div> : <div className={styles.assets}>{inventory.assets.map(asset => <button className={equipped.has(asset.assetId) ? styles.assetSelected : styles.asset} key={asset.assetId} onClick={() => toggle(asset)} aria-pressed={equipped.has(asset.assetId)}><Image unoptimized src={asset.imageUrl} alt={asset.name} width={72} height={72} /><span><strong>{asset.name}</strong><span>In your collection</span></span><b>{equipped.has(asset.assetId) ? 'IN ARMY' : 'ADD'}</b></button>)}</div>}
        <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save army'}</button><button disabled={busy} onClick={() => void disconnectCollectionWallet()}>Disconnect collection</button></div>
        <p>RIPSY checks ownership in the background. Transferred figures leave your army automatically.</p>
      </section>
    </div>}
  </main>;
}
