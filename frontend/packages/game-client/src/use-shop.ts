import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isFigureId, isTerminalMint, parseMintOrder, type FigureId, type MintOrder, type ShopCatalog } from '@rps/core/shop';
import { ShopClient } from './shop-client';

export interface PurchaseIntent {
  key: string;
  figureId: FigureId;
  buyer: string;
  order?: MintOrder;
  signingStarted?: boolean;
  signed?: string;
}
export interface PurchaseStorage {
  load(): Promise<string | null>;
  save(value: string | null): Promise<void>;
}
export function parsePurchaseIntent(raw: string): PurchaseIntent {
  const value = JSON.parse(raw) as PurchaseIntent;
  if (!value || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(value.key)
    || !isFigureId(value.figureId) || typeof value.buyer !== 'string'
    || (value.signed !== undefined && (typeof value.signed !== 'string' || value.signed.length > 1644))
    || (value.signingStarted !== undefined && typeof value.signingStarted !== 'boolean')) throw new Error('Could not restore your purchase. Contact support before starting another mint.');
  if (value.order) value.order = parseMintOrder(value.order);
  if (value.order && (value.order.buyer !== value.buyer || value.order.figureId !== value.figureId)) throw new Error('Invalid saved purchase');
  return value;
}

export function useShop(baseUrl: string, sessionToken: string, storage: PurchaseStorage) {
  const client = useMemo(() => new ShopClient(baseUrl, sessionToken), [baseUrl, sessionToken]);
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [intent, setIntent] = useState<PurchaseIntent | null>(null);
  const intentRef = useRef<PurchaseIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const activeOperation = useRef(false);
  const persist = useCallback(async (value: PurchaseIntent | null) => {
    await storage.save(value ? JSON.stringify(value) : null);
    intentRef.current = value;
    setIntent(value);
  }, [storage]);

  const loadCatalog = useCallback(async () => {
    try { setCatalog(await client.catalog()); setError(null); }
    catch (cause) { setError(message(cause)); }
  }, [client]);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    let mounted = true;
    storage.load().then(raw => {
      if (!mounted) return;
      const saved = raw ? parsePurchaseIntent(raw) : null;
      intentRef.current = saved; setIntent(saved); setRestored(true);
    }).catch(cause => { if (mounted) setError(message(cause)); });
    return () => { mounted = false; };
  }, [storage]);

  const run = useCallback(async (operation: () => Promise<void>, background = false) => {
    if (activeOperation.current || !sessionToken || !restored) return;
    activeOperation.current = true;
    if (!background) { setBusy(true); setError(null); }
    try { await operation(); } catch (cause) { setError(message(cause)); }
    finally { activeOperation.current = false; setBusy(false); }
  }, [sessionToken, restored]);

  const checkStatus = useCallback((background = false) => run(async () => {
    const current = intentRef.current;
    if (!current) return;
    const order = current.order ? await client.get(current.order.id) : await client.create(current.figureId, current.buyer, current.key);
    const latest = current.signed && !isTerminalMint(order) ? await client.submit(order.id, current.signed) : order;
    await persist({ ...current, order: latest, ...(isTerminalMint(latest) ? { signed: undefined } : {}) });
  }, background), [client, persist, run]);

  useEffect(() => {
    if (!restored || !sessionToken || !intent || (intent.order && isTerminalMint(intent.order))) return;
    // Recover prepared orders too: a wallet could broadcast before app restart.
    const timer = setInterval(() => { void checkStatus(true); }, 4000);
    return () => clearInterval(timer);
  }, [checkStatus, intent, restored, sessionToken]);

  const prepare = useCallback((figureId: FigureId, buyer: string) => run(async () => {
    if (intentRef.current) throw new Error('Finish or close your current purchase first.');
    // This is an idempotency identifier, not an authentication credential.
    const pending: PurchaseIntent = { key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, figureId, buyer };
    await persist(pending);
    const order = await client.create(figureId, buyer, pending.key);
    await persist({ ...pending, order });
  }), [client, persist, run]);

  const confirm = useCallback((sign: (order: MintOrder) => Promise<string>) => run(async () => {
    const pending = intentRef.current;
    if (!pending?.order) throw new Error('Check your pending purchase status.');
    const order = await client.get(pending.order.id);
    if (order.status !== 'prepared') { await persist({ ...pending, order }); return; }
    // Record BEFORE opening another app. A interrupted wallet interaction must
    // recover the existing order, never accidentally create another payment.
    const signing = { ...pending, order, signingStarted: true };
    await persist(signing);
    const signed = await sign(order);
    await persist({ ...signing, signed });
    const submitted = await client.submit(order.id, signed);
    await persist({ ...signing, signed, order: submitted });
  }), [client, persist, run]);

  const dismiss = useCallback(() => run(async () => {
    const current = intentRef.current;
    if (current?.signingStarted && (!current.order || !isTerminalMint(current.order))) throw new Error('Wait for confirmation or expiry before starting another purchase.');
    await persist(null);
  }), [persist, run]);

  return { catalog, order: intent?.order ?? null, hasPurchase: Boolean(intent), signingStarted: Boolean(intent?.signingStarted), ready: restored && Boolean(sessionToken), busy, error, prepare, confirm, dismiss, checkStatus, loadCatalog };
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : 'Could not complete this request. Try again.'; }
