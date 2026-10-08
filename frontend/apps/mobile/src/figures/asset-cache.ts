import { NativeModules } from 'react-native';
import type { FigureDefinition } from '@rps/core/figure-manifest';

interface NativeCache { getAnimation(url: string, sha256: string, bytes: number): Promise<string> }
const pending = new Map<string, Promise<string>>();
/** Native private disk cache checks exact size + SHA-256, including on offline reads. */
export function cacheFigureAnimation(animation: FigureDefinition['animation']): Promise<string> {
  const existing = pending.get(animation.sha256);
  if (existing) return existing;
  const native = NativeModules.RipsyFigureCache as NativeCache | undefined;
  if (!native) return Promise.reject(new Error('Please update the app to download this fighter.'));
  const work = native.getAnimation(animation.url, animation.sha256, animation.bytes)
    .finally(() => { pending.delete(animation.sha256); });
  pending.set(animation.sha256, work);
  return work;
}
