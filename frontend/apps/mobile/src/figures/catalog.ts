import { useEffect, useSyncExternalStore } from 'react';
import { AppState, type ImageSourcePropType } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { ShopClient } from '@rps/game-client/shop';
import { parseFigureManifest, type FigureDefinition } from '@rps/core/figure-manifest';
import { FIGURES } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';

const bundledPortraits: Record<string, ImageSourcePropType> = {
  fig1: require('../assets/shop/fig1.png'), fig2: require('../assets/shop/fig2.png'),
  bonk: require('../assets/shop/bonk.png'), jup: require('../assets/shop/jup.png'), ore: require('../assets/shop/ore.png'),
};
// Offline bootstrap only. Successful API/cache data replaces names and images.
const fallback = FIGURES.map(f => ({ ...f, imageUrl: '', animation: undefined }));
export type DisplayFigure = Omit<FigureDefinition, 'animation'> & { animation?: FigureDefinition['animation'] };
let figures: DisplayFigure[] = fallback;
let restored = false;
let inFlight: Promise<void> | null = null;
let lastFetch = 0;
const listeners = new Set<() => void>();
const service = 'com.dangervalley.ripsy.figure-catalog-v1';
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => figures;
function publish(next: DisplayFigure[]) {
  // A no-op refresh must not replace Rive controllers/files mid-animation.
  if (JSON.stringify(next) === JSON.stringify(figures)) return;
  figures = next; listeners.forEach(listener => listener());
}
export function refreshFigureCatalog(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetch < 60_000) return Promise.resolve();
  inFlight = (async () => {
    if (!restored) {
      restored = true;
      try {
        const saved = await Keychain.getGenericPassword({ service });
        if (saved) publish(parseFigureManifest(JSON.parse(saved.password)).figures);
      } catch { /* Corrupt or unavailable cache never blocks the free starter. */ }
    }
    const result = await new ShopClient(getGameWebSocketUrl().replace(/^ws/, 'http'), '').figures();
    // IDs/variants are permanent identities; reject server remapping, including after restart.
    for (const old of figures) {
      if (result.figures.some(f => (f.id === old.id && f.variant !== old.variant) || (f.variant === old.variant && f.id !== old.id))) throw new Error('Figure catalog identities changed');
    }
    // Keep retired definitions available for existing armies/opponent models.
    const merged = { ...result, figures: [...result.figures, ...figures.filter(f => f.animation && !result.figures.some(n => n.id === f.id))] as FigureDefinition[] };
    parseFigureManifest(merged);
    publish(merged.figures);
    lastFetch = Date.now();
    await Keychain.setGenericPassword('figure-catalog', JSON.stringify(merged), { service, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  })().finally(() => { inFlight = null; });
  return inFlight;
}
export function useFigureCatalog() {
  const definitions = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { refreshFigureCatalog().catch(() => undefined); }, []);
  return definitions;
}
export function useFigureCatalogLifecycle() {
  useEffect(() => {
    refreshFigureCatalog().catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshFigureCatalog(true).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);
}
export function figurePortrait(id: string, definitions: DisplayFigure[], imageUrl?: string): ImageSourcePropType {
  const url = imageUrl || definitions.find(f => f.id === id)?.imageUrl;
  return url ? { uri: url } : bundledPortraits[id] ?? bundledPortraits.fig1!;
}
