import { FIGURES } from './figure-registry.js';
import { parseFigureManifest, type FigureManifest } from '@rps/core/figure-manifest';

/** Publish immutable/versioned assets; changing bytes requires changing the registry digest. */
export function figureManifest(origin: string): FigureManifest {
  return parseFigureManifest({ schema: 1, figures: FIGURES.map(f => {
    const resource = f.animation;
    if (!resource) throw new Error('Figure resources are not published');
    const imageUrl = `${origin}/figures/${f.id}.png?v=${f.portrait?.sha256 ?? resource.sha256}`;
    return { ...f, imageUrl,
      ...(f.portrait ? { portrait: { ...f.portrait, url: imageUrl } } : {}),
      animation: { ...resource, contract: 1, url: `${origin}/figures/${f.id}.riv?v=${resource.sha256}` } };
  }) });
}
