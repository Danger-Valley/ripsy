"use client";

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { decimalToUnits, unitsToDecimal, type AdminFigure, type AdminPackSettings } from '@rps/core/shop-admin';
import { chanceWeight } from './admin-client';
import styles from './shop-admin.module.css';

export function BackendPackEditor({ settings, figures, disabled, request, onSaved, usd }: {
  settings: AdminPackSettings; figures: AdminFigure[]; disabled: boolean;
  request<T>(path: string, method: string, body: unknown): Promise<T>;
  onSaved(): Promise<void>; usd(amount: string, mint: string | null, decimals: number): string;
}) {
  const [baseline, setBaseline] = useState(settings);
  const [price, setPrice] = useState(() => unitsToDecimal(settings.catalog.payment.amount, 6));
  const initialChances = (value: AdminPackSettings) => Object.fromEntries(figures.filter(f => f.packEligible)
    .map(f => [f.id, unitsToDecimal(String(value.catalog.drops.find(d => d.figureId === f.id)?.weight ?? 0), 4)]));
  const [chances, setChances] = useState(() => initialChances(settings));
  const [available, setAvailable] = useState(settings.catalog.available);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reset = (value: AdminPackSettings) => {
    setBaseline(value); setPrice(unitsToDecimal(value.catalog.payment.amount, 6));
    setChances(initialChances(value)); setAvailable(value.catalog.available);
  };
  let total: number | null = 0;
  try { total = figures.filter(f => f.packEligible).reduce((sum, f) => sum + chanceWeight(chances[f.id] ?? '0'), 0); } catch { total = null; }
  const dirty = price !== unitsToDecimal(baseline.catalog.payment.amount, 6) || available !== baseline.catalog.available
    || figures.filter(f => f.packEligible).some(f => (chances[f.id] ?? '0') !== unitsToDecimal(String(baseline.catalog.drops.find(d => d.figureId === f.id)?.weight ?? 0), 4));
  let priceValid = true;
  try { decimalToUnits(price, 6, 9_999_999_999_999_999n); } catch { priceValid = false; }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const reload = async () => {
    setSaving(true); setError(null);
    try { await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload pack settings. Your edits are kept.'); }
    finally { setSaving(false); }
  };
  const save = async () => {
    if (saving || disabled) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      decimalToUnits(price, 6, 9_999_999_999_999_999n);
      const drops = figures.filter(f => f.packEligible).map(f => ({ figureId: f.id, weight: chanceWeight(chances[f.id] ?? '0') })).filter(d => d.weight > 0);
      if (total !== 1_000_000) throw new Error('Chances must total exactly 100%.');
      const next = await request<AdminPackSettings>('pack-settings', 'PUT', { expectedVersion: baseline.catalog.version, price, drops, available });
      reset(next);
      setNotice('Pack settings saved. New purchases use these values; saved purchases keep their original price, chances and result.');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save pack settings. Your edits are kept.'); }
    finally { setSaving(false); }
  };
  return <section className={styles.card} aria-labelledby="pack-title">
    <div className={styles.sectionHeader}><div><h2 id="pack-title">Fighter pack</h2><p>Settings revision {baseline.catalog.version}</p></div>
      <div className={styles.actions}><button type="button" disabled={disabled || saving} onClick={() => void reload()}>Load current settings</button>
        <button type="button" disabled={disabled || saving} onClick={() => { reset(settings); setError(null); setNotice(null); }}>Reset edits</button></div></div>
    <p>Change the price and chances together. Saved purchases retain their original settings.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={disabled || saving}><legend>Pack settings</legend>
        <label htmlFor="pack-price">Pack price (SKR)</label>
        <input id="pack-price" type="text" autoComplete="off" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} aria-describedby="usd-pack pack-price-help" />
        <small id="usd-pack" data-testid="usd-pack" className={styles.usd}>{usd(price, baseline.catalog.payment.mint, 6)}</small>
        <small id="pack-price-help">Use a positive SKR amount with up to 6 decimal places. No commas.</small>
        <div className={styles.figures}>{figures.filter(f => f.packEligible).map(f => <div className={styles.figure} key={f.id}>
          <Image src={f.imageUrl} alt="" width={64} height={80} unoptimized />
          <div><label htmlFor={`chance-${f.id}`}>{f.name} (%)</label>
            <input id={`chance-${f.id}`} type="text" autoComplete="off" inputMode="decimal" value={chances[f.id] ?? '0'} onChange={event => setChances(current => ({ ...current, [f.id]: event.target.value }))} />
            <small>Use 0 to leave this fighter out of the pack.</small></div>
        </div>)}</div>
        <p aria-live="polite">Total chances: <strong>{total === null ? 'Invalid value' : `${unitsToDecimal(String(total), 4)}%`}</strong></p>
        <label className={styles.checkbox}><input type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)} /> Allow new pack purchases</label>
        <button className={styles.primary} type="submit" aria-busy={saving} disabled={!dirty || !priceValid || total !== 1_000_000}>{saving ? 'Saving pack settings...' : 'Save pack settings'}</button>
      </fieldset>
    </form>
    <p>Settings save immediately on the server. No transaction signature or network fee is required.</p>
    <h3>Pack settings history</h3>
    {!baseline.audit.length ? <p>No pack settings changes yet.</p> : <ol className={styles.audit}>{baseline.audit.slice(0, 10).map(entry => <li key={entry.after.version}>
      <strong>{unitsToDecimal(entry.after.payment.amount, 6)} SKR</strong> · <time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString()}</time>
      <ul>{entry.after.drops.map(drop => <li key={drop.figureId}>{figures.find(f => f.id === drop.figureId)?.name ?? drop.figureId}: {unitsToDecimal(String(drop.weight), 4)}%</li>)}</ul>
    </li>)}</ol>}
  </section>;
}
