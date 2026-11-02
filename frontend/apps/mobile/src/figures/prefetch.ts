import { Image } from 'react-native';
import type { FigureDefinition } from '@rps/core/figure-manifest';
import { cacheFigureAnimation, cacheFigurePortrait } from './asset-cache';
import { bundledHashes, bundledPortraitHashes } from './bundled-resources';

type Definition = Omit<FigureDefinition, 'animation'> & { animation?: FigureDefinition['animation'] };
// Leave space in the 96 MiB native cache for models encountered on demand.
export const figurePrefetchBudget = 64 * 1024 * 1024;
/** Warm data, not live Rive controllers. Never block navigation or a purchase. */
export async function prefetchFigureResources(definitions: Definition[], options: {
  isActive(): boolean;
  onPortraitReady(figure: Definition, uri: string): void;
  onPortraitUnavailable?(figure: Definition): void;
}) {
  const jobs: Array<() => Promise<unknown>> = [];
  const seen = new Set<string>();
  let plannedBytes = 0;
  const add = (key: string, bytes: number, run: () => Promise<unknown>) => {
    if (seen.has(key) || plannedBytes + bytes > figurePrefetchBudget) return;
    seen.add(key); plannedBytes += bytes; jobs.push(run);
  };
  for (const figure of definitions) {
    if (figure.animation && figure.animation.sha256 !== bundledHashes[figure.variant]) {
      const resource = figure.animation;
      add(`riv:${resource.sha256}:${resource.bytes}`, resource.bytes, () => cacheFigureAnimation(resource));
    }
    if (figure.portrait) {
      const resource = figure.portrait;
      if (resource.sha256 !== bundledPortraitHashes[figure.id]) {
        // Each ID gets its own callback even when multiple figures share a PNG.
        add(`png:${figure.id}:${resource.sha256}:${resource.bytes}`, resource.bytes, async () => {
          try {
            const uri = await cacheFigurePortrait(resource);
            options.onPortraitReady(figure, uri);
          } catch { options.onPortraitUnavailable?.(figure); }
        });
      }
    } else if (figure.imageUrl) {
      // Old servers remain usable; only new descriptors promise verified disk PNGs.
      add(`legacy:${figure.imageUrl}`, 0, () => Image.prefetch(figure.imageUrl));
    }
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length && options.isActive()) {
      const job = jobs[cursor++];
      try { await job(); } catch { /* Retry on next foreground/catalog sync or on-demand use. */ }
    }
  };
  // Two bounded workers, no startup fan-out of every registration at once.
  await Promise.all([worker(), worker()]);
}
