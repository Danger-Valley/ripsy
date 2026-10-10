import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isTerminalPack,
  parsePackOrder,
  type PackCatalog,
  type PackOrder,
} from "@rps/core/packs";
import { ShopClient, ShopRequestError } from "./shop-client";
import type { TokenShortfall } from '@rps/core/shop';
import type { PurchaseStorage } from "./use-shop";

export interface PackIntent {
  paymentMode?: 'sol';
  key: string;
  buyer: string;
  order?: PackOrder;
  signingStarted?: boolean;
  signed?: string;
}
export function parsePackIntent(raw: string): PackIntent {
  const v = JSON.parse(raw) as PackIntent;
  if (
    !v ||
    (v.paymentMode !== undefined && v.paymentMode !== 'sol') ||
    !/^[A-Za-z0-9_-]{16,80}$/.test(v.key) ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.buyer) ||
    (v.signingStarted !== undefined && typeof v.signingStarted !== "boolean") ||
    (v.signed !== undefined &&
      (typeof v.signed !== "string" ||
        v.signed.length > 1644 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(v.signed)))
  )
    throw new Error(
      "Could not restore your pack. Contact support before buying another."
    );
  if (v.order) {
    v.order = parsePackOrder(v.order);
    if (v.order.buyer !== v.buyer)
      throw new Error("Invalid saved pack account");
  }
  return v;
}

/** Separate durable recovery record; a paid pack can never be re-rolled here. */
export function usePackShop(
  baseUrl: string,
  token: string,
  storage: PurchaseStorage
) {
  const client = useMemo(
    () => new ShopClient(baseUrl, token),
    [baseUrl, token]
  );
  const [catalog, setCatalog] = useState<PackCatalog | null>(null);
  const [intent, setIntent] = useState<PackIntent | null>(null);
  const current = useRef<PackIntent | null>(null);
  const operation = useRef(false);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundingRequired, setFundingRequired] = useState<TokenShortfall | null>(null);
  const fundingRef = useRef<TokenShortfall | null>(null);
  const preparationBlocked = useRef(false);
  const persist = useCallback(
    async (value: PackIntent | null) => {
      await storage.save(value ? JSON.stringify(value) : null);
      current.current = value;
      setIntent(value);
    },
    [storage]
  );
  const loadCatalog = useCallback(async () => {
    if (!token) return;
    try {
      setCatalog(await client.packCatalog());
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }, [client, token]);
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);
  useEffect(() => {
    let mounted = true;
    void storage
      .load()
      .then((raw) => {
        if (!mounted) return;
        const saved = raw ? parsePackIntent(raw) : null;
        current.current = saved;
        setIntent(saved);
        setRestored(true);
      })
      .catch((cause) => {
        if (mounted) setError(message(cause));
      });
    return () => {
      mounted = false;
    };
  }, [storage]);
  const run = useCallback(
    async (fn: () => Promise<void>, background = false) => {
      if (operation.current || !restored || !token) return;
      operation.current = true;
      if (!background) {
        setBusy(true);
        setError(null);
      }
      try {
        await fn();
        if (!background || !preparationBlocked.current) { fundingRef.current = null; setFundingRequired(null); preparationBlocked.current = false; }
      } catch (cause) {
        const recovery = cause instanceof ShopRequestError ? cause.recovery : null;
        fundingRef.current = recovery; setFundingRequired(recovery);
        preparationBlocked.current = cause instanceof ShopRequestError && !current.current?.order;
        setError(message(cause));
      } finally {
        operation.current = false;
        setBusy(false);
      }
    },
    [restored, token]
  );
  const checkStatus = useCallback(
    (background = false) =>
      run(async () => {
        const saved = current.current;
        if (!saved) return;
        if (background && preparationBlocked.current) return;
        const order = saved.order
          ? await client.getPack(saved.order.id)
          : await client.createPack(saved.buyer, saved.key, saved.paymentMode);
        const latest =
          saved.signed && ["prepared", "submitted"].includes(order.status)
            ? await client.submitPack(order.id, saved.signed)
            : order;
        await persist({
          ...saved,
          order: latest,
          ...(!["prepared", "submitted"].includes(latest.status)
            ? { signed: undefined }
            : {}),
        });
      }, background),
    [client, persist, run]
  );
  useEffect(() => {
    if (
      !restored ||
      !token ||
      !intent ||
      (intent.order && isTerminalPack(intent.order))
    )
      return;
    const timer = setInterval(() => {
      void checkStatus(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [checkStatus, intent, restored, token]);
  const prepare = useCallback(
    (buyer: string) =>
      run(async () => {
        if (current.current) throw new Error("Finish your current pack first.");
        const saved: PackIntent = {
          buyer,
          key: `${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2)}-${Math.random().toString(36).slice(2)}`,
        };
        await persist(saved);
        await persist({
          ...saved,
          order: await client.createPack(buyer, saved.key),
        });
      }),
    [client, persist, run]
  );
  const confirm = useCallback(
    (sign: (order: PackOrder) => Promise<string>) =>
      run(async () => {
        const saved = current.current;
        if (!saved?.order) throw new Error("Check your saved pack first.");
        const order = await client.getPack(saved.order.id);
        if (order.status !== "prepared") {
          await persist({ ...saved, order });
          return;
        }
        const signing = { ...saved, order, signingStarted: true };
        await persist(signing);
        const signed = await sign(order);
        await persist({ ...signing, signed });
        await persist({
          ...signing,
          signed,
          order: await client.submitPack(order.id, signed),
        });
      }),
    [client, persist, run]
  );
  const dismiss = useCallback(
    () =>
      run(async () => {
        const saved = current.current;
        if (
          saved?.signingStarted &&
          (!saved.order || !isTerminalPack(saved.order))
        )
          throw new Error(
            "Wait for this pack result or payment expiry. A paid pack cannot be cancelled or re-rolled."
          );
        await persist(null);
      }),
    [persist, run]
  );
  const buyWithSol = useCallback(() => run(async () => {
    const saved = current.current;
    if (!saved || saved.order || saved.signingStarted || saved.signed || !fundingRef.current || saved.paymentMode) throw new Error('Check your saved pack first.');
    const pending: PackIntent = { ...saved, paymentMode: 'sol' };
    await persist(pending);
    await persist({ ...pending, order: await client.createPack(pending.buyer, pending.key, 'sol') });
  }), [client, persist, run]);
  return {
    catalog,
    order: intent?.order ?? null,
    hasPurchase: Boolean(intent),
    signingStarted: Boolean(intent?.signingStarted),
    ready: restored && Boolean(token),
    busy,
    error,
    purchaseBuyer: intent?.buyer ?? null,
    fundingRequired: !intent?.order && !intent?.signingStarted && !intent?.paymentMode ? fundingRequired : null,
    buyWithSol,
    prepare,
    confirm,
    dismiss,
    checkStatus,
    loadCatalog,
  };
}
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Could not update your pack. Check its saved status.";
}
