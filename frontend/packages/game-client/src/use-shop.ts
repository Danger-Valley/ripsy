import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isFigureId, isTerminalMint, parseMintOrder, type TokenShortfall, type FigureId, type MintOrder, type SeekerChallenge, type SeekerProof, type ShopCatalog } from '@rps/core/shop';
import { ShopClient, ShopRequestError } from './shop-client';

export interface PurchaseIntent {
  paymentMode?: 'sol';
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
    || (value.paymentMode !== undefined && value.paymentMode !== 'sol')
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
  const [fundingRequired, setFundingRequired] = useState<TokenShortfall | null>(null);
  const fundingRef = useRef<TokenShortfall | null>(null);
  const preparationBlocked = useRef(false);
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
    try { await operation(); if (!background || !preparationBlocked.current) { setFundingRequired(null); fundingRef.current = null; preparationBlocked.current = false; } }
    catch (cause) {
      const recovery = cause instanceof ShopRequestError ? cause.recovery : null;
      fundingRef.current = recovery; setFundingRequired(recovery);
      preparationBlocked.current = cause instanceof ShopRequestError && !intentRef.current?.order;
      setError(message(cause));
    }
    finally { activeOperation.current = false; setBusy(false); }
  }, [sessionToken, restored]);

  const checkStatus = useCallback((background = false) => run(async () => {
    const current = intentRef.current;
    if (!current) return;
    if (background && preparationBlocked.current) return;
    const order = current.order ? await client.get(current.order.id) : await client.create(current.figureId, current.buyer, current.key, current.paymentMode);
    const latest = current.signed && !isTerminalMint(order) ? await client.submit(order.id, current.signed) : order;
    await persist({ ...current, order: latest, ...(isTerminalMint(latest) ? { signed: undefined } : {}) });
  }, background), [client, persist, run]);

  useEffect(() => {
    if (!restored || !sessionToken || !intent || (intent.order && isTerminalMint(intent.order))) return;
    // Recover prepared orders too: a wallet could broadcast before app restart.
    const timer = setInterval(() => { void checkStatus(true); }, 4000);
    return () => clearInterval(timer);
  }, [checkStatus, intent, restored, sessionToken]);

  // Only a foreground buy/continue action supplies a signer. Recovery and
  // status polling never open the wallet, and the operation lock spans both
  // preparation and signing so a background poll cannot steal the handoff.
  const signPrepared = useCallback(async (sign: (order: MintOrder) => Promise<string>) => {
    const pending = intentRef.current;
    if (!pending?.order) throw new Error('Check your pending purchase status.');
    const order = await client.get(pending.order.id);
    if (order.status !== 'prepared') { await persist({ ...pending, order }); return; }
    const signing = { ...pending, order, signingStarted: true };
    await persist(signing);
    const signed = pending.signed ?? await sign(order);
    await persist({ ...signing, signed });
    const submitted = await client.submit(order.id, signed);
    await persist({ ...signing, signed, order: submitted });
  }, [client, persist]);

  const prepare = useCallback((figureId: FigureId, buyer: string, proveSeeker?: (challenge: SeekerChallenge) => Promise<SeekerProof>, sign?: (order: MintOrder) => Promise<string>) => run(async () => {
    const previous = intentRef.current;
    if (previous) {
      if (!previous.order || !isTerminalMint(previous.order)) throw new Error('Finish or close your current purchase first.');
      // Keep the old receipt until the backend confirms it cannot still charge.
      const latest = await client.get(previous.order.id);
      await persist({ ...previous, order: latest });
      if (!isTerminalMint(latest)) throw new Error('Finish or close your current purchase first.');
    }
    if (figureId === 'fig2' && !proveSeeker) throw new Error('Seeker fighter can only be minted to a verified Solana Seeker wallet.');
    if (proveSeeker) {
      const challenge = await client.seekerChallenge();
      await client.verifySeeker(await proveSeeker(challenge));
    }
    // This is an idempotency identifier, not an authentication credential.
    const pending: PurchaseIntent = { key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, figureId, buyer };
    await persist(pending);
    const order = await client.create(figureId, buyer, pending.key);
    await persist({ ...pending, order });
    if (sign) await signPrepared(sign);
  }), [client, persist, run, signPrepared]);

  const confirm = useCallback((sign: (order: MintOrder) => Promise<string>) => run(() => signPrepared(sign)), [run, signPrepared]);

  const buyWithSol = useCallback((sign?: (order: MintOrder) => Promise<string>) => run(async () => {
    const saved = intentRef.current;
    if (!saved || saved.order || saved.signingStarted || saved.signed || !fundingRef.current || saved.paymentMode) throw new Error('Check your saved purchase first.');
    const pending: PurchaseIntent = { ...saved, paymentMode: 'sol' };
    // Persist before HTTP. A lost response must recover this exact request.
    await persist(pending);
    await persist({ ...pending, order: await client.create(pending.figureId, pending.buyer, pending.key, 'sol') });
    if (sign) await signPrepared(sign);
  }), [client, persist, run, signPrepared]);

  const dismiss = useCallback(() => run(async () => {
    const current = intentRef.current;
    if (current?.signingStarted && (!current.order || !isTerminalMint(current.order))) throw new Error('Wait for confirmation or expiry before starting another purchase.');
    await persist(null);
  }), [persist, run]);

  const clearWallet = useCallback(() => run(async () => {
    await client.clearWallet();
  }), [client, run]);

  return { catalog, order: intent?.order ?? null, hasPurchase: Boolean(intent), purchaseBuyer: intent?.buyer ?? null,
    fundingRequired: !intent?.order && !intent?.signingStarted && !intent?.paymentMode ? fundingRequired : null, buyWithSol,
    signingStarted: Boolean(intent?.signingStarted), ready: restored && Boolean(sessionToken), busy, error, prepare, confirm, dismiss, checkStatus, loadCatalog, clearWallet };
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : 'Could not complete this request. Try again.'; }
