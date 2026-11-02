import { useEffect, useSyncExternalStore } from 'react';
import { AppState, type ImageSourcePropType } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { ShopClient } from '@rps/game-client/shop';
import { parseFigureManifest, type FigureDefinition, type FigureResource } from '@rps/core/figure-manifest';
import { FIGURES } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';
import { bundledPortraits, bundledPortraitHashes } from './bundled-resources';
import { prefetchFigureResources } from './prefetch';

// Offline bootstrap only. Successful API/cache data replaces names and images.
const fallback = FIGURES.map(f => ({ ...f, imageUrl: '', animation: undefined }));
export type DisplayFigure = Omit<FigureDefinition, 'animation'> & { animation?: FigureDefinition['animation']; portraitUri?: string };
let figures: DisplayFigure[] = fallback;
let restored = false;
let inFlight: Promise<void> | null = null;
let lastFetch = 0;
let resourceOwners = 0;
let resourcePass: Promise<void> | null = null;
let queuedFigures: DisplayFigure[] | null = null;
const listeners = new Set<() => void>();
const service = 'com.dangervalley.ripsy.figure-catalog-v1';
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => figures;
function publish(next: DisplayFigure[], discardLocalPortraits = false) {
  next = next.map(figure => {
    const old = figures.find(f => f.id === figure.id);
    if (!old) return figure;
    // A PNG/name refresh must not replace an otherwise identical animation descriptor.
    const result = { ...figure, animation: sameResource(figure.animation, old.animation) ? old.animation : figure.animation };
    if (!discardLocalPortraits && !result.portraitUri && old.portraitUri && figure.portrait && sameResource(figure.portrait, old.portrait)) result.portraitUri = old.portraitUri;
    return JSON.stringify(result) === JSON.stringify(old) ? old : result;
  });
  // A no-op refresh must not replace Rive controllers/files mid-animation.
  if (JSON.stringify(next) === JSON.stringify(figures)) return;
  figures = next; listeners.forEach(listener => listener());
}
function sameResource(a?: FigureResource & { contract?: number }, b?: FigureResource & { contract?: number }) {
  return a === b || Boolean(a && b && a.url === b.url && a.sha256 === b.sha256 && a.bytes === b.bytes && a.contract === b.contract);
}
function resourcesActive() { return resourceOwners > 0 && AppState.currentState !== 'background' && AppState.currentState !== 'inactive'; }
function enqueueResources() {
  if (!resourceOwners) return;
  queuedFigures = figures;
  if (resourcePass || !resourcesActive()) return;
  resourcePass = (async () => {
    while (queuedFigures && resourcesActive()) {
      const batch = queuedFigures;
      queuedFigures = null;
      await prefetchFigureResources(batch, { isActive: resourcesActive, onPortraitReady: (definition, uri) => {
        const current = figures.find(f => f.id === definition.id);
        if (!uri.startsWith('file://') || !current?.portrait || !sameResource(current.portrait, definition.portrait)) return;
        publish(figures.map(f => f === current ? { ...f, portraitUri: uri } : f));
      }, onPortraitUnavailable: definition => {
        const current = figures.find(f => f.id === definition.id);
        if (!current?.portraitUri || !sameResource(current.portrait, definition.portrait)) return;
        // Evicted/corrupt disk files must not remain selected after validation fails.
        const next = { ...current }; delete next.portraitUri;
        publish(figures.map(f => f === current ? next : f), true);
      } });
    }
  })().catch(() => undefined).finally(() => {
    resourcePass = null;
    if (queuedFigures && resourcesActive()) enqueueResources();
  });
}
function assertIdentities(next: FigureDefinition[]) {
  for (const old of figures) {
    if (next.some(f => (f.id === old.id && f.variant !== old.variant) || (f.variant === old.variant && f.id !== old.id))) throw new Error('Figure catalog identities changed');
  }
}
export function refreshFigureCatalog(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && lastFetch > 0 && Date.now() - lastFetch < 60_000) return Promise.resolve();
  inFlight = (async () => {
    if (!restored) {
      restored = true;
      try {
        const saved = await Keychain.getGenericPassword({ service });
        if (saved) {
          const cached = parseFigureManifest(JSON.parse(saved.password));
          assertIdentities(cached.figures);
          publish(cached.figures);
          enqueueResources();
        }
      } catch { /* Corrupt or unavailable cache never blocks the free starter. */ }
    }
    const result = parseFigureManifest(await new ShopClient(getGameWebSocketUrl().replace(/^ws/, 'http'), '').figures());
    // IDs/variants are permanent identities; reject server remapping, including after restart.
    assertIdentities(result.figures);
    // Keep retired definitions available for existing armies/opponent models.
    const retired = figures.filter(f => f.animation && !result.figures.some(n => n.id === f.id)).map(f => {
      const canonical = { ...f }; delete canonical.portraitUri; return canonical as FigureDefinition;
    });
    const merged = { ...result, figures: [...result.figures, ...retired] };
    parseFigureManifest(merged);
    publish(merged.figures);
    enqueueResources();
    lastFetch = Date.now();
    try {
      await Keychain.setGenericPassword('figure-catalog', JSON.stringify(merged), { service, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    } catch { /* A storage error does not invalidate a successfully fetched catalog. */ }
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
    let mounted = true;
    let previous = AppState.currentState;
    let generation = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    resourceOwners++;
    const refresh = (force = false, attempt = 0, expectedGeneration = generation) => {
      enqueueResources();
      refreshFigureCatalog(force).catch(() => {
        if (mounted && expectedGeneration === generation && resourcesActive() && attempt < 2) {
          retryTimer = setTimeout(() => refresh(true, attempt + 1, expectedGeneration), attempt ? 9000 : 3000);
        }
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === previous) return;
      clearTimeout(retryTimer);
      generation++;
      if (state === 'active' && previous !== 'active') refresh(true);
      previous = state;
    });
    return () => {
      mounted = false; clearTimeout(retryTimer); subscription.remove(); resourceOwners--;
      if (!resourceOwners) queuedFigures = null;
    };
  }, []);
}
export function figurePortrait(id: string, definitions: DisplayFigure[], imageUrl?: string): ImageSourcePropType {
  const definition = definitions.find(f => f.id === id);
  // Inventory/catalog may carry the same canonical image without its version query.
  const canonical = definition && (!imageUrl || imageUrl.split('?')[0] === definition.imageUrl.split('?')[0]);
  if (canonical && definition.portrait) {
    if (definition.portraitUri) return { uri: definition.portraitUri };
    if (definition.portrait.sha256 === bundledPortraitHashes[id] && bundledPortraits[id]) return bundledPortraits[id];
    return { uri: definition.imageUrl };
  }
  const url = imageUrl || definition?.imageUrl;
  return url ? { uri: url } : bundledPortraits[id] ?? bundledPortraits.fig1!;
}
