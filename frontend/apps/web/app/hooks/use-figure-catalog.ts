"use client";
import { useEffect, useState } from 'react';
import { ShopClient } from '@rps/game-client/shop';
import { FIGURES } from '@rps/core/shop';
import { parseFigureManifest, type FigureDefinition } from '@rps/core/figure-manifest';

type Definition = Omit<FigureDefinition, 'animation'> & { animation?: FigureDefinition['animation'] };
const bootstrap: Definition[] = FIGURES.map(f => ({ ...f, imageUrl: `/figures/${f.id}.png` }));
const base = process.env.NEXT_PUBLIC_SHOP_API_URL ?? 'https://api.ripsy.fun';
const key = `ripsy.figure-catalog.v1:${base}`;
let cached: Definition[] = bootstrap;
let request: Promise<void> | null = null;
let lastFetch = 0;
const listeners = new Set<(value: Definition[]) => void>();
export function useFigureCatalog() {
  const [definitions, setDefinitions] = useState(cached);
  useEffect(() => {
    listeners.add(setDefinitions);
    const refresh = () => {
      if (request || Date.now() - lastFetch < 60_000) return;
      request = (async () => {
        if (cached === bootstrap) {
          try { const raw = localStorage.getItem(key); if (raw) cached = parseFigureManifest(JSON.parse(raw)).figures; } catch {}
          listeners.forEach(notify => notify(cached));
        }
        const result = await new ShopClient(base, '').figures();
        for (const old of cached) if (result.figures.some(f => (f.id === old.id && f.variant !== old.variant) || (f.variant === old.variant && f.id !== old.id))) throw new Error('Figure catalog identities changed');
        const retired = cached.filter(old => old.animation && !result.figures.some(f => f.id === old.id));
        const next = [...result.figures, ...retired];
        if (JSON.stringify(cached) !== JSON.stringify(next)) cached = next;
        lastFetch = Date.now();
        listeners.forEach(notify => notify(cached));
        try { localStorage.setItem(key, JSON.stringify({ schema: 1, figures: cached })); } catch {}
      })().catch(() => undefined).finally(() => { request = null; });
    };
    refresh();
    const resume = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => { listeners.delete(setDefinitions); document.removeEventListener('visibilitychange', resume); };
  }, []);
  return definitions;
}
