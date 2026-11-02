"use client";

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { decimalToUnits } from '@rps/core/shop-admin';
import { FIGURE_UPLOAD_LIMITS, type AdminFigures } from '@rps/core/admin-figures';
import { AdminApiError } from './admin-client';
import styles from './shop-admin.module.css';

type Fields = { name: string; id: string; description: string; currency: string; price: string };
const initial: Fields = { name: '', id: '', description: '', currency: 'SKR', price: '' };
const mib = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MiB`;
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file. Choose it again.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

export function FigureRegistrationEditor({ active, disabled, request, onPublished }: {
  active: boolean; disabled: boolean;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onPublished: () => Promise<unknown>;
}) {
  const [data, setData] = useState<AdminFigures | null>(null);
  const [fields, setFields] = useState(initial);
  const [rive, setRive] = useState<File | null>(null), [png, setPng] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [uncertain, setUncertain] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [fileKey, setFileKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  const epoch = useRef(0), running = useRef<number | null>(null), requestId = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null), title = useRef<HTMLHeadingElement>(null);
  const afterPublish = useRef(onPublished); afterPublish.current = onPublished;
  const accept = useCallback(async (next: AdminFigures) => {
    setData(next); setUncertain(false); setConfirmed(false);
    const published = next.published.find(f => f.requestId === requestId.current);
    if (published) {
      setNotice(`${published.name} is published. Permanent ID: ${published.id}; variant ${published.variant}. It is not added to the pack.`);
      requestId.current = null; setFields(initial); setRive(null); setPng(null); setFileKey(n => n + 1);
      try { await afterPublish.current(); }
      catch { setError('The figure is published, but the price list could not refresh. Reload current values below; do not publish again.'); }
    }
  }, []);
  const reload = useCallback(async () => {
    const current = epoch.current;
    if (running.current === current) return;
    running.current = current; setBusy('Loading saved upload…'); setError(null);
    try { const next = await request<AdminFigures>('figures'); if (current === epoch.current) await accept(next); }
    catch (cause) { if (current === epoch.current) setError(cause instanceof AdminApiError && cause.status === 404
      ? 'Figure uploads are not available on this backend yet. Deploy the updated backend first; existing store settings are unchanged.'
      : cause instanceof Error ? cause.message : 'Could not load registrations. Retry without losing your edits.'); }
    finally { if (running.current === current) running.current = null; if (current === epoch.current) setBusy(null); }
  }, [request, accept]);
  useEffect(() => {
    epoch.current++; setData(null); setConfirmed(false); setBusy(null);
    if (active) void reload();
    return () => { epoch.current++; };
  }, [active, reload]);
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  useEffect(() => {
    if (!rive && !png && !fields.name && !data?.draft) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [rive, png, fields.name, data?.draft]);
  const perform = async (label: string, action: () => Promise<AdminFigures>) => {
    if (running.current === epoch.current || !active) return;
    const current = epoch.current;
    running.current = current; setBusy(label); setError(null); setNotice(null);
    try { const next = await action(); if (current === epoch.current) { await accept(next); title.current?.focus(); } }
    catch (cause) {
      if (current === epoch.current) {
        // Even an error response can follow a committed write. Recover with GET,
        // not a second POST, before permitting another mutating action.
        setUncertain(true); setError(cause instanceof Error ? cause.message : 'The result is unknown. Reload the saved upload before continuing.');
      }
    } finally { if (running.current === current) running.current = null; if (current === epoch.current) setBusy(null); }
  };
  const edit = (key: keyof Fields, value: string) => {
    setFields(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: '' }));
    setNotice(null); requestId.current = null;
  };
  const verify = () => {
    if (!data) return;
    const next: Record<string, string> = {};
    if (!fields.name.trim() || fields.name.trim().length > 100) next.name = 'Enter a name, up to 100 characters.';
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(fields.id)) next.id = 'Use an unused lowercase ID, starting with a letter (up to 64 characters).';
    if (!fields.description.trim() || fields.description.trim().length > 2000) next.description = 'Enter a description, up to 2,000 characters.';
    const currency = data.currencies.find(c => c.symbol === fields.currency);
    try { if (!currency) throw new Error(); decimalToUnits(fields.price, currency.decimals, currency.symbol === 'SOL' ? BigInt(Number.MAX_SAFE_INTEGER) : undefined); }
    catch { next.price = `Enter a positive price with up to ${currency?.decimals ?? 6} decimal places. No commas.`; }
    if (!rive || rive.size < 8 || rive.size > FIGURE_UPLOAD_LIMITS.rive) next.rive = 'Choose a Rive file, at most 8 MiB.';
    if (!png || png.size < 8 || png.size > FIGURE_UPLOAD_LIMITS.png) next.png = 'Choose a PNG image, at most 4 MiB.';
    setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    requestId.current ??= crypto.randomUUID();
    const id = requestId.current;
    void perform('Checking files and saving preview…', async () => {
      const [riveBase64, pngBase64] = await Promise.all([fileBase64(rive!), fileBase64(png!)]);
      return request<AdminFigures>('figures/draft', 'POST', { ...fields, requestId: id, riveBase64, pngBase64 });
    });
  };
  const draft = data?.draft, expired = Boolean(draft && now >= draft.expiresAt);
  const locked = disabled || Boolean(busy) || uncertain;
  const help = (key: string, fallback: string) => <small id={`new-${key}-help`}>{errors[key] || fallback}</small>;
  return <section hidden={!active} className={styles.card} aria-labelledby="add-figure-title" aria-busy={Boolean(busy)}>
    <div className={styles.sectionHeader}><div><h2 id="add-figure-title" ref={title} tabIndex={-1}>Add a figure</h2><p>Upload, check, then publish. No NFT is minted.</p></div>
      <button type="button" disabled={Boolean(busy) || disabled} onClick={() => void reload()}>Reload saved upload</button></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <div role="alert" className={`${styles.error} ${styles.figureAlert}`}><p>{error}</p>{uncertain && <p>Nothing will be retried automatically. Reload the saved upload to check what the server accepted.</p>}</div>}
    {busy && <p role="status" className={styles.progress}>{busy}</p>}
    {!data ? <p>{busy ? 'Reading current registrations…' : 'Load the saved upload to open the form. Your selected files and edits stay on this page.'}</p> : <>
      <p className={styles.storage}>Permanent figure storage: {mib(data.usedBytes)} of {mib(data.limits.storage)}. One pending upload is saved for 30 minutes.</p>
      {draft ? <div className={styles.figurePreview} aria-label="Verified figure preview">
        <div className={styles.portraitPreview}><Image src={draft.previewDataUrl} alt={`${draft.name} uploaded portrait`} width={240} height={280} unoptimized /></div>
        <div><span className={styles.badge}>Files verified</span><h3>{draft.name}</h3><p>{draft.description}</p>
          <dl className={styles.figureFacts}><dt>Permanent ID</dt><dd>{draft.id}</dd><dt>Price</dt><dd>{draft.price} {draft.currency}</dd><dt>Availability</dt><dd>All devices · not included in packs</dd><dt>Rive / PNG</dt><dd>{mib(draft.riveBytes)} / {mib(draft.pngBytes)}</dd></dl>
          <p>Rive contract 1 passed: Front/Back machines, inputs, artboard and action timings.</p>
          <details><summary>Verified file hashes</summary><small>Rive</small><span className={styles.address}>{draft.riveSha256}</span><small>PNG</small><span className={styles.address}>{draft.pngSha256}</span></details>
          <p>Review expires at <time dateTime={new Date(draft.expiresAt).toISOString()}>{new Date(draft.expiresAt).toLocaleTimeString()}</time>. Name, ID and files cannot be edited after publication. A permanent variant number is assigned when publishing.</p>
          {expired && <p role="alert">This preview expired. Reload, then verify your files again.</p>}
          <label className={styles.checkbox}><input type="checkbox" checked={confirmed} disabled={locked || expired} onChange={e => setConfirmed(e.target.checked)} />I checked the name, files and price. Publish to all devices, without adding this figure to the pack.</label>
          <div className={styles.actions}><button className={styles.primary} type="button" disabled={locked || expired || !confirmed} onClick={() => {
            requestId.current = draft.requestId;
            void perform('Publishing figure…', () => request<AdminFigures>('figures/publish', 'POST', { requestId: draft.requestId, expectedRevision: data.revision }));
          }}>Publish figure</button><button type="button" disabled={locked} onClick={() => void perform('Discarding preview…', () => request<AdminFigures>('figures/draft', 'DELETE', { requestId: draft.requestId }))}>Discard preview</button></div>
        </div>
      </div> : null}
    </>}
      {/* Keep browser FileList and React File state together through review,
          expiry and re-authentication. Only a successful publish resets them. */}
      <form hidden={!data || Boolean(draft)} ref={form} noValidate onSubmit={event => { event.preventDefault(); verify(); }}>
        <fieldset disabled={locked || !active || !data || Boolean(draft)}><legend>New figure · all fields required</legend>
          <div className={styles.figureForm}>
            <div><label htmlFor="new-name">Name</label><input id="new-name" value={fields.name} maxLength={100} required aria-invalid={Boolean(errors.name)} aria-describedby="new-name-help" onChange={e => edit('name', e.target.value)} />{help('name', 'Shown in the shop and NFT metadata.')}</div>
            <div><label htmlFor="new-id">Permanent ID</label><input id="new-id" value={fields.id} maxLength={64} required spellCheck={false} autoCapitalize="none" aria-invalid={Boolean(errors.id)} aria-describedby="new-id-help" onChange={e => edit('id', e.target.value)} />{help('id', 'Example: moon-fighter. Never reused or changed.')}</div>
            <div className={styles.formWide}><label htmlFor="new-description">Description</label><textarea id="new-description" value={fields.description} maxLength={2000} rows={3} required aria-invalid={Boolean(errors.description)} aria-describedby="new-description-help" onChange={e => edit('description', e.target.value)} />{help('description', 'Shown in the shop and NFT metadata. Up to 2,000 characters.')}</div>
            <div><label htmlFor="new-currency">Currency</label><select id="new-currency" value={fields.currency} onChange={e => edit('currency', e.target.value)}>{(data?.currencies ?? [{ symbol: fields.currency }]).map(c => <option key={c.symbol}>{c.symbol}</option>)}</select><small>Existing store currencies only. Locked after publication.</small></div>
            <div><label htmlFor="new-price">Price</label><input id="new-price" type="text" inputMode="decimal" value={fields.price} required aria-invalid={Boolean(errors.price)} aria-describedby="new-price-help" onChange={e => edit('price', e.target.value)} />{help('price', 'A positive token amount. Prices can be updated later.')}</div>
            <div><label htmlFor="new-rive">Rive animation</label><input key={`rive-${fileKey}`} id="new-rive" type="file" accept=".riv" required aria-invalid={Boolean(errors.rive)} aria-describedby="new-rive-help" onChange={e => { setRive(e.target.files?.[0] ?? null); requestId.current = null; setErrors(p => ({ ...p, rive: '' })); }} />{help('rive', 'Up to 8 MiB. Must use the current fighter animation contract (1).')}</div>
            <div><label htmlFor="new-png">PNG portrait</label><input key={`png-${fileKey}`} id="new-png" type="file" accept=".png,image/png" required aria-invalid={Boolean(errors.png)} aria-describedby="new-png-help" onChange={e => { setPng(e.target.files?.[0] ?? null); requestId.current = null; setErrors(p => ({ ...p, png: '' })); }} />{help('png', 'Static 8-bit RGB/RGBA, up to 4 MiB and 2048 × 2048.')}</div>
          </div><p>Verification does not publish the figure or change existing prices and pack chances.</p>
          <button className={styles.primary} type="submit">Check files & preview</button>
        </fieldset>
      </form>
      {data && data.published.length > 0 && <details><summary>Published through admin ({data.published.length})</summary><ul>{data.published.slice(-5).reverse().map(f => <li key={f.id}><strong>{f.name}</strong> · {f.id} · variant {f.variant}</li>)}</ul></details>}
  </section>;
}
