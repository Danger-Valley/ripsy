import { NativeModules } from 'react-native';
import type { FigureDefinition, FigureResource } from '@rps/core/figure-manifest';

interface NativeCache {
  getAnimation(url: string, sha256: string, bytes: number): Promise<string>;
  getPortrait?(url: string, sha256: string, bytes: number): Promise<string>;
}
const pending = new Map<string, Promise<string>>();
/** Native private disk cache checks exact size + SHA-256, including on offline reads. */
export function cacheFigureAnimation(animation: FigureDefinition['animation']): Promise<string> {
  return cacheResource(animation, 'getAnimation');
}
export function cacheFigurePortrait(portrait: FigureResource): Promise<string> {
  return cacheResource(portrait, 'getPortrait');
}
function cacheResource(resource: FigureResource, method: 'getAnimation' | 'getPortrait'): Promise<string> {
  const key = `${method}:${resource.sha256}:${resource.bytes}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const native = NativeModules.RipsyFigureCache as NativeCache | undefined;
  if (!native?.[method]) return Promise.reject(new Error('Please update the app to download this fighter.'));
  let request: Promise<string>;
  try { request = native[method](resource.url, resource.sha256, resource.bytes); }
  catch (error) { return Promise.reject(error); }
  const work = request.finally(() => { pending.delete(key); });
  pending.set(key, work);
  return work;
}
