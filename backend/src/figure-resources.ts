import { FIGURES, registeredFigureUrls } from './figure-registry.js';
import { parseFigureManifest, type FigureManifest } from '@rps/core/figure-manifest';

/** Publish immutable/versioned assets; changing bytes requires changing the registry digest. */
export function figureManifest(origin: string): FigureManifest {
  return parseFigureManifest({ schema: 1, figures: FIGURES.map(f => {
    const resource = f.animation;
    if (!resource) throw new Error('Figure resources are not published');
    const urls = registeredFigureUrls(f, origin);
    const imageUrl = f.resources ? urls.png : `${urls.png}?v=${f.portrait?.sha256 ?? resource.sha256}`;
    const { resources: _resources, ...definition } = f;
    return { ...definition, imageUrl,
      ...(f.portrait ? { portrait: { ...f.portrait, url: imageUrl } } : {}),
      animation: { ...resource, contract: 1, url: f.resources ? urls.rive : `${urls.rive}?v=${resource.sha256}` } };
  }) });
}
