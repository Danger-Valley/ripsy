"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerIdentity } from '@rps/game-client';
import type { WalletChallenge } from '@rps/core/shop';
import { PACK_PROGRAM_ID } from '@rps/core/packs';
import { decimalToUnits, unitsToDecimal, type AdminPrices, type AdminPublication, type AdminSnapshot, type AdminUsdRates } from '@rps/core/shop-admin';
import { useBrowserWallet } from '../../hooks/use-browser-wallet';
import { adminRequest, AdminApiError, changedPrices, chanceWeight, usdEstimate } from './admin-client';
import styles from './shop-admin.module.css';

type AdminSession = { token: string; address: string; expiresAt: number };
const JOB_KEY = 'ripsy.admin.publication.v1'; // Public request ID only, never the admin credential.
const pending = (job: AdminPublication | null) => Boolean(job && ['prepared', 'submitted'].includes(job.status));

function AdminAddress({ value, label }: { value: string; label: string }) {
  const [copyState, setCopyState] = useState('Copy');
  return <div><span className={styles.address} title={value}>{label}: {value.slice(0, 4)}...{value.slice(-4)}</span><div className={styles.actions}><button type="button" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard.writeText(value).then(() => setCopyState('Copied'), () => setCopyState('Copy failed')); }}>{copyState}</button><details><summary>Full address</summary><span className={styles.address}>{value}</span></details></div></div>;
}

export function ShopAdminContent() {
  const wallet = useBrowserWallet();
  const { sessionToken, error: playerError } = usePlayerIdentity();
  const [config, setConfig] = useState<{ enabled: boolean; address: string | null } | null>(null);
  const [session, setSession] = useState<AdminSession | null>(null);
  const sessionRef = useRef<AdminSession | null>(null);
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [rates, setRates] = useState<AdminUsdRates | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesRefresh, setRatesRefresh] = useState(0);
  const [rateNow, setRateNow] = useState(Date.now());
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [packPrice, setPackPrice] = useState('');
  const [chances, setChances] = useState<Record<string, string>>({});
  const [job, setJob] = useState<AdminPublication | null>(null);
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [reviewPrices, setReviewPrices] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoverId, setRecoverId] = useState<string | null>(null);
  const prepareRef = useRef<{ id: string; payload: string } | null>(null);
  const authed = Boolean(session && wallet.isConnected && wallet.address === session.address);

  const perform = useCallback(async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError(null); setNotice(null);
    try { await action(); } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) { sessionRef.current = null; setSession(null); }
      setError(cause instanceof Error ? cause.message : 'Request failed. Retry without losing your edits.');
    } finally { busyRef.current = false; setBusy(null); }
  }, []);
  const protectedRequest = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const current = sessionRef.current;
    if (!current) throw new Error('Sign in with the administrative wallet.');
    const result = await adminRequest<T>(path, current.token, method, body);
    if (sessionRef.current !== current) throw new Error('The wallet or admin session changed. Sign in again.');
    return result;
  }, []);
  useEffect(() => {
    if (!authed) { setRates(null); return; }
    let cancelled = false; let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true; setRatesLoading(true);
      try {
        const next = await protectedRequest<AdminUsdRates>('usd-rates');
        if (!cancelled) { setRates(next); setRatesError(next.error); setRateNow(Date.now()); }
      } catch (cause) {
        if (!cancelled) {
          setRates(null); setRatesError('Could not load USD rates. Retry; your token prices and edits are unchanged.');
          if (cause instanceof AdminApiError && cause.status === 401) { sessionRef.current = null; setSession(null); }
        }
      } finally { fetching = false; if (!cancelled) setRatesLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [authed, session?.token, ratesRefresh, protectedRequest]);
  useEffect(() => {
    if (!rates) return;
    const timer = setTimeout(() => setRateNow(Date.now()), Math.max(0, rates.expiresAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [rates]);
  const usd = (amount: string, mint: string | null, decimals: number) => ratesLoading && !rates
    ? 'Loading USD estimate...' : usdEstimate(amount, mint, decimals, rates, rateNow);
  const applyPrices = (next: AdminPrices) => { setPrices(Object.fromEntries(next.figures.map(f => [f.id, f.price]))); setReviewPrices(false); };
  const applyPack = (next: AdminSnapshot) => {
    setPackPrice(next.pack ? unitsToDecimal(next.pack.payment.amount, 6) : '');
    setChances(Object.fromEntries(next.prices.figures.filter(f => f.packEligible).map(f => [f.id,
      unitsToDecimal(String(next.pack?.drops.find(d => d.figureId === f.id)?.weight ?? 0), 4)])));
  };
  const load = async (reset = false) => {
    const next = await protectedRequest<AdminSnapshot>('settings');
    setData(next);
    if (reset) { applyPrices(next.prices); applyPack(next); }
  };
  useEffect(() => {
    void perform('Loading admin access...', async () => {
      setConfig(await adminRequest('config'));
      try { const id = localStorage.getItem(JOB_KEY); if (id && /^[a-f0-9]{64}$/.test(id)) setRecoverId(id); } catch {}
    });
  }, [perform]);
  useEffect(() => {
    if (!session) return;
    if (!wallet.isConnected || wallet.address !== session.address || Date.now() >= session.expiresAt) {
      sessionRef.current = null; setSession(null); setData(null); setJob(null); return;
    }
    const timer = setTimeout(() => { sessionRef.current = null; setSession(null); setNotice('Admin session expired. Sign in again. Your draft stays on this page.'); }, session.expiresAt - Date.now());
    return () => clearTimeout(timer);
  }, [session, wallet.address, wallet.isConnected]);
  const edits = changedPrices(data?.prices.figures ?? [], prices);
  const dirty = Object.keys(edits.prices).length > 0 || Object.keys(edits.errors).length > 0;
  const priceDirty = Boolean(data?.pack && packPrice !== unitsToDecimal(data.pack.payment.amount, 6));
  const chancesDirty = Boolean(data?.pack && data.prices.figures.filter(f => f.packEligible).some(f => chances[f.id] !== unitsToDecimal(String(data.pack!.drops.find(d => d.figureId === f.id)?.weight ?? 0), 4)));
  const packDirty = priceDirty || chancesDirty;
  useEffect(() => {
    if (!dirty && !packDirty && !pending(job)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, packDirty, job]);
  const rememberJob = (next: AdminPublication) => {
    setJob(next); setConfirmedReview(false);
    try { if (pending(next)) { localStorage.setItem(JOB_KEY, next.id); setRecoverId(next.id); } else { localStorage.removeItem(JOB_KEY); setRecoverId(null); } } catch {}
  };
  const authenticate = () => perform('Waiting for sign-in signature...', async () => {
    if (!config?.address || wallet.address !== config.address || !wallet.isConnected) throw new Error('Connect the configured administrative wallet.');
    const challenge = await adminRequest<WalletChallenge>('challenge', sessionToken, 'POST');
    const proof = await wallet.proveWallet(challenge);
    const next = await adminRequest<AdminSession>('verify', sessionToken, 'POST', proof);
    sessionRef.current = next; setSession(next); await load(true);
    if (recoverId) rememberJob(await protectedRequest<AdminPublication>(`publications/${recoverId}`));
    setNotice('Admin access verified. No transaction was sent.');
  });
  const logout = () => perform('Signing out...', async () => {
    try { if (sessionRef.current) await protectedRequest('session', 'DELETE'); } finally { sessionRef.current = null; setSession(null); setData(null); setJob(null); }
  });
  const savePrices = () => perform('Saving figure prices...', async () => {
    const currencies = Object.fromEntries(data!.prices.figures.filter(f => f.id in edits.prices)
      .map(f => [f.id, { mint: f.mint, symbol: f.symbol, decimals: f.decimals }]));
    const next = await protectedRequest<AdminPrices>('prices', 'PUT', { revision: data!.prices.revision, prices: edits.prices, currencies });
    setData(previous => previous ? { ...previous, prices: next } : null); applyPrices(next); setNotice('Figure prices saved. New purchases use these prices; existing requests keep their original quote.');
  });
  const prepare = (kind: 'edition' | 'price' = 'edition') => perform('Verifying and simulating...', async () => {
    const drops = kind === 'edition' ? data!.prices.figures.filter(f => f.packEligible).map(f => ({ figureId: f.id, weight: chanceWeight(chances[f.id] ?? '0') })).filter(d => d.weight > 0) : [];
    if (kind === 'edition' && (!drops.length || drops.reduce((sum, d) => sum + d.weight, 0) !== 1_000_000)) throw new Error('Pack chances must total exactly 100%.');
    const price = kind === 'price' ? packPrice : unitsToDecimal(data!.pack!.payment.amount, 6);
    decimalToUnits(price, 6, 9_999_999_999_999_999n);
    const payload = kind === 'price'
      ? { expectedVersion: data!.pack!.version, expectedPrice: data!.pack!.payment.amount, expectedRevision: data!.packPriceRevision ?? '0', price }
      : { expectedVersion: data!.pack!.version, price, drops };
    const serialized = JSON.stringify(payload);
    if (!prepareRef.current || prepareRef.current.payload !== serialized) prepareRef.current = { id: crypto.randomUUID(), payload: serialized };
    const next = await protectedRequest<AdminPublication>(kind === 'price' ? 'pack-price' : 'publications', 'POST', { ...payload, requestId: prepareRef.current.id });
    rememberJob(next); setNotice('Simulation passed. Review the update below before signing.');
  });
  const sign = () => perform('Waiting for publication signature...', async () => {
    if (!job || !confirmedReview || job.status !== 'prepared') return;
    const signed = await wallet.signShopTransaction(job);
    // Store no credentials or private keys. A pending request is recovered by ID.
    setJob({ ...job, status: 'submitted' });
    const next = await protectedRequest<AdminPublication>(`publications/${job.id}/submit`, 'POST', { transaction: signed });
    rememberJob(next);
    if (next.status === 'confirmed') { await load(false); setNotice(next.kind === 'price' ? 'Pack price updated without a new edition. Paid packs keep their price and chances.' : `Edition ${next.catalog.version} published. Paid packs keep their price and chances.`); }
    else setNotice('Update submitted. Check status before starting another update.');
  });
  const check = () => perform('Checking publication...', async () => {
    const id = job?.id ?? recoverId;
    if (!id) return;
    const next = await protectedRequest<AdminPublication>(`publications/${id}`); rememberJob(next);
    if (next.status === 'confirmed') { await load(false); setNotice(next.kind === 'price' ? 'Price update is confirmed.' : `Edition ${next.catalog.version} is confirmed.`); }
  });
  let total: number | null = 0;
  try { total = Object.values(chances).reduce((sum, value) => sum + chanceWeight(value), 0); } catch { total = null; }
  const disabled = Boolean(busy || wallet.busy);

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/app">RIPSY playground</Link><h1>Shop control room</h1><p>Figure prices and fighter pack editions.</p></div><span className={styles.badge}>{data?.cluster === 'mainnet-beta' ? 'Solana mainnet' : data?.cluster === 'devnet' ? 'Solana devnet' : 'Admin access'}</span></header>
    {(error || playerError) && <div role="alert" className={styles.error}><strong>Action needed</strong><p>{error ?? playerError}</p><button disabled={disabled} onClick={() => void perform('Reloading...', async () => { if (authed) await load(false); else setConfig(await adminRequest('config')); })}>Retry / reload current values</button><p>Your form edits are kept when reloading current values.</p></div>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {busy && <p role="status" aria-live="polite" className={styles.progress}>{busy}</p>}
    <section className={styles.card} aria-labelledby="access-title"><div className={styles.sectionHeader}><h2 id="access-title">Administrative wallet</h2>{authed && <button onClick={() => void logout()} disabled={disabled}>Sign out</button>}</div>
      {!config ? <p>Loading access configuration...</p> : !config.enabled ? <p>Administration is disabled. Set SHOP_ADMIN_WALLET on the backend to enable it.</p> : <><AdminAddress value={config.address!} label="Required wallet" /><p>Sign one message to open a 30-minute admin session. Publishing a pack requires a separate transaction signature.</p>
        {!wallet.isConnected ? <div className={styles.actions}>{wallet.wallets.length ? wallet.wallets.map(w => <button key={w.name} disabled={disabled} onClick={() => void perform('Connecting wallet...', async () => { await wallet.connect(w); })}>Connect {w.name}</button>) : <p>No compatible wallet detected. Open this page in a wallet-enabled browser.</p>}</div> : <div className={styles.actions}><AdminAddress value={wallet.address!} label="Connected" /><button disabled={disabled} onClick={() => void perform('Disconnecting...', async () => { if (sessionRef.current) await protectedRequest('session', 'DELETE'); sessionRef.current = null; setSession(null); await wallet.disconnect(); })}>Disconnect</button>{!authed && <button className={styles.primary} disabled={disabled || !sessionToken || wallet.address !== config.address} onClick={() => void authenticate()}>Sign in as admin</button>}</div>}
        {wallet.isConnected && wallet.address !== config.address && <p role="alert">This is not the administrative wallet. Switch accounts to continue.</p>}</>}
    </section>
    {authed && !data && <section className={styles.card}><h2>Store settings</h2><p>Loading current prices and edition...</p><button disabled={disabled} onClick={() => void perform('Loading settings...', () => load(true))}>Load settings</button></section>}
    {authed && data && <>
      <section className={`${styles.card} ${styles.rates}`} aria-label="USD reference rates">
        <div><strong>USD equivalents</strong><p>{ratesError ?? (rates?.fetchedAt && rateNow < rates.expiresAt
          ? <>Mainnet rates from <a href="https://developers.jup.ag/docs/price" target="_blank" rel="noreferrer">Jupiter</a>, retrieved <time dateTime={new Date(rates.fetchedAt).toISOString()}>{new Date(rates.fetchedAt).toLocaleTimeString()}</time>.</>
          : ratesLoading ? 'Loading market rates...' : 'Rates expired or unavailable. Refresh to get current estimates.')}</p><small>Approximate values, excluding fees. Payment stays in the listed token. Rates refresh automatically without resetting your edits.</small></div>
        <button type="button" disabled={ratesLoading} aria-busy={ratesLoading} onClick={() => setRatesRefresh(n => n + 1)}>{ratesLoading ? 'Refreshing rates...' : 'Refresh USD rates'}</button>
      </section>
      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="prices-title"><div className={styles.sectionHeader}><div><h2 id="prices-title">Figure prices</h2><p>Live pricing revision {data.prices.revision}</p></div><button disabled={disabled} onClick={() => applyPrices(data.prices)}>Reset edits</button></div>
          <p>Saving changes the price for new purchases on every device. Currency, recipient and figure identity are locked. RIPSY 001 stays free.</p>
          <form onSubmit={event => { event.preventDefault(); setReviewPrices(true); }}>
            <div className={styles.figures}>{data.prices.figures.map(f => <div key={f.id} className={styles.figure}>
              <Image src={`/figures/${f.id}.png`} alt="" width={64} height={80} unoptimized />
              <div><label htmlFor={`price-${f.id}`}>{f.name} <span className={styles.currency}>{f.symbol}</span></label><p>Current: {f.price || 'Not priced'} {f.price && f.symbol}{f.price && <span className={styles.usd}> {usd(f.price, f.mint, f.decimals)}</span>}</p>
              <input id={`price-${f.id}`} type="text" inputMode="decimal" value={prices[f.id] ?? ''} disabled={disabled || reviewPrices} onChange={event => setPrices(p => ({ ...p, [f.id]: event.target.value }))} aria-invalid={Boolean(edits.errors[f.id])} aria-describedby={`usd-${f.id} help-${f.id}`} />
              <small id={`usd-${f.id}`} className={styles.usd} data-testid={`usd-${f.id}`}>{usd(prices[f.id] ?? '', f.mint, f.decimals)}</small>
              <small id={`help-${f.id}`}>{edits.errors[f.id] ?? `Up to ${f.decimals} decimal places. No commas.`}</small>
              {f.mint && <details><summary>Payment token</summary><span className={styles.address}>{f.mint}</span></details>}</div>
            </div>)}</div>
            {!data.prices.figures.length && <p>No purchasable figures are registered.</p>}
            <button type="submit" className={styles.primary} disabled={disabled || !dirty || Object.keys(edits.errors).length > 0 || reviewPrices}>Review price changes</button>
          </form>
          {reviewPrices && <div className={styles.review} role="region" aria-label="Review figure price changes"><h3>Confirm new prices</h3><ul>{Object.entries(edits.prices).map(([id, value]) => { const f = data.prices.figures.find(f => f.id === id)!; return <li key={id}>{f.name}: {f.price || 'Not priced'} → <strong>{value} {f.symbol}</strong><small className={styles.usd}>{usd(value, f.mint, f.decimals)}</small></li>; })}</ul><p>These prices go live immediately after saving.</p><div className={styles.actions}><button type="button" onClick={() => setReviewPrices(false)} disabled={disabled}>Back to editing</button><button className={styles.primary} onClick={() => void savePrices()} disabled={disabled || !Object.keys(edits.prices).length}>Save live prices</button></div></div>}
        </section>
        <section className={styles.card} aria-labelledby="pack-title"><h2 id="pack-title">Fighter pack</h2>
          {!data.pack ? <><p role="alert">{data.packError}</p><button disabled={disabled} onClick={() => void perform('Loading active edition...', () => load(false))}>Retry pack state</button></> : <>
            <p><span className={styles.badge}>Active edition {data.pack.version}</span> {data.pack.available ? 'Purchases open' : 'Purchases paused'}</p><p>Current price: <strong>{unitsToDecimal(data.pack.payment.amount, 6)} SKR</strong><span className={styles.usd}> {usd(unitsToDecimal(data.pack.payment.amount, 6), data.pack.payment.mint, 6)}</span>. Paid packs keep their original price and chances.</p>
            <form onSubmit={event => { event.preventDefault(); void prepare('price'); }}>
              <fieldset disabled={disabled || pending(job)}><legend>Change pack price</legend>
                <label htmlFor="pack-price">Pack price (SKR)</label><input id="pack-price" type="text" inputMode="decimal" value={packPrice} onChange={event => setPackPrice(event.target.value)} aria-describedby="usd-pack pack-price-help" /><small id="usd-pack" data-testid="usd-pack" className={styles.usd}>{usd(packPrice, data.pack.payment.mint, 6)}</small><small id="pack-price-help">Up to 6 decimal places. New purchases only. No new edition or changes to odds.</small>
                <button className={styles.primary} type="submit" disabled={!priceDirty}>Review & simulate price update</button>
              </fieldset>
            </form><p>Wallet signature required. The first change creates one small price account; later changes pay only the transaction fee.</p>
            <form onSubmit={event => { event.preventDefault(); void prepare(); }}>
              <fieldset disabled={disabled || pending(job)}><legend>Next edition {data.pack.version + 1}</legend>
                <p>New chances start at the current live price: {unitsToDecimal(data.pack.payment.amount, 6)} SKR. Price edits above are separate.</p>
                <h3>Drop probabilities</h3><p>Use 0 to exclude a figure. Total must be exactly 100%.</p>
                {data.prices.figures.filter(f => f.packEligible).map(f => <div className={styles.chance} key={f.id}><label htmlFor={`chance-${f.id}`}>{f.name}</label><div><input id={`chance-${f.id}`} type="text" inputMode="decimal" value={chances[f.id] ?? '0'} onChange={event => setChances(c => ({ ...c, [f.id]: event.target.value }))} /><span>%</span></div></div>)}
                <p className={styles.total} aria-live="polite">Total: {total === null ? 'Invalid probability' : `${unitsToDecimal(String(total), 4)}%`}</p>
                <button className={styles.primary} type="submit" disabled={total !== 1_000_000 || !chancesDirty}>Review & simulate next edition</button>
              </fieldset>
            </form><p>Simulation does not publish anything. The admin pays the network fee and edition account rent in SOL. Paused purchases stay paused.</p>
          </>}
          {recoverId && !job && <button disabled={disabled} onClick={() => void check()}>Recover pending publication</button>}
          {job && <div className={styles.review} aria-label="Publication review"><h3>{job.kind === 'price' ? 'Price update' : `Edition ${job.catalog.version}`}: {job.status}</h3><p><strong>{unitsToDecimal(job.catalog.payment.amount, 6)} SKR</strong> per pack <span className={styles.usd}>{usd(unitsToDecimal(job.catalog.payment.amount, 6), job.catalog.payment.mint, 6)}</span></p><ul>{job.catalog.drops.map(d => <li key={d.figureId}>{data.prices.figures.find(f => f.id === d.figureId)?.name ?? d.figureId}: <strong>{unitsToDecimal(String(d.weight), 4)}%</strong></li>)}</ul>
            <p>Estimated {job.kind === 'price' ? 'update' : 'publication'} cost: <strong>{unitsToDecimal(job.networkFeeLamports, 9)} SOL</strong> ({job.kind === 'price' && job.priceUpdate?.expectedRevision !== '0' ? 'transaction fee only' : 'fee + account rent'})</p>
            <small className={styles.usd}>{usd(unitsToDecimal(job.networkFeeLamports, 9), null, 9)}</small>
            <p>{job.kind === 'price' ? 'This updates the price for future purchases on Solana mainnet. The edition, chances and paid packs are unchanged.' : 'This calls the RIPSY Packs program on Solana mainnet and creates an immutable edition account sized for these rewards only.'}</p>
            <details><summary>On-chain details</summary><p>Solana mainnet</p><AdminAddress value={job.buyer} label="Administrator" /><AdminAddress value={job.edition} label="Edition account" /><AdminAddress value={PACK_PROGRAM_ID} label="RIPSY Packs program" /><p>Request: <span className={styles.address}>{job.id}</span></p></details>
            {job.kind === 'price' && job.priceUpdate && <details><summary>Price change details</summary><p>{unitsToDecimal(job.priceUpdate.expectedPrice, 6)} SKR to {unitsToDecimal(job.catalog.payment.amount, 6)} SKR. Revision {job.priceUpdate.expectedRevision} to {job.priceUpdate.revision}.</p><AdminAddress value={job.priceUpdate.account} label="Price account" /></details>}
            {job.signature && <p><a href={`https://solscan.io/tx/${job.signature}`} target="_blank" rel="noreferrer">View publication transaction</a></p>}
            {job.status === 'prepared' && <><label className={styles.checkbox}><input type="checkbox" checked={confirmedReview} onChange={event => setConfirmedReview(event.target.checked)} disabled={disabled} />{job.kind === 'price' ? 'I checked the new price. Apply it to future purchases only.' : 'I checked the price and odds. Publish this immutable edition on mainnet.'}</label><button className={styles.primary} disabled={disabled || !confirmedReview} onClick={() => void sign()}>{job.kind === 'price' ? 'Sign & update pack price' : `Sign & publish edition ${job.catalog.version}`}</button></>}
            {pending(job) ? <button disabled={disabled} onClick={() => void check()}>Check publication status</button> : <button disabled={disabled} onClick={() => void perform('Loading published settings...', async () => { await load(true); setJob(null); prepareRef.current = null; })}>Load current settings</button>}
            {job.status === 'prepared' && <button disabled={disabled} onClick={() => { setJob(null); prepareRef.current = null; setConfirmedReview(false); try { localStorage.removeItem(JOB_KEY); } catch {} setRecoverId(null); }}>Discard unsigned review</button>}
            {job.status === 'submitted' && <p>Do not create another publication. Status checks recover the same signed transaction after connection errors.</p>}
            {['expired', 'failed', 'superseded'].includes(job.status) && <p>This request is no longer publishable. Reload the active edition before preparing another.</p>}
          </div>}
        </section>
      </div>
      <section className={styles.card}><h2>Price history</h2>{!data.prices.audit.length ? <p>No admin price changes yet. The store is using its configured defaults.</p> : <ol className={styles.audit}>{data.prices.audit.slice(0, 20).map(a => <li key={a.revision}><strong>Revision {a.revision}</strong> · <time dateTime={new Date(a.at).toISOString()}>{new Date(a.at).toLocaleString()}</time><ul>{Object.entries(a.changes).map(([id, change]) => {
        const f = data.prices.figures.find(f => f.id === id); const denomination = change.currency ?? f;
        return <li key={id}>{f?.name ?? id}: {change.before && denomination ? unitsToDecimal(change.before, denomination.decimals) : 'Not priced'} → {denomination ? unitsToDecimal(change.after, denomination.decimals) : change.after} {denomination?.symbol}</li>;
      })}</ul><span className={styles.address}>{a.address}</span></li>)}</ol>}</section>
    </>}
    <footer className={styles.footer}>RIPSY admin · No private keys are stored in this page.</footer>
  </main>;
}
