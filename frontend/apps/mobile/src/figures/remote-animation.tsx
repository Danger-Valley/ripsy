import { useCallback, useEffect, useState } from 'react';
import { useRiveFile, type RiveFile } from '@rive-app/react-native';
import type { FigureDefinition } from '@rps/core/figure-manifest';
import { cacheFigureAnimation } from './asset-cache';

export const bundledHashes: Record<number, string> = {
  1: 'b44ee60dcabf2893b0409abd2193a5e68a32af0211c400417508524a7f3ff0ba',
  2: '7ebfc2d64675e7882f4dfb7b2e6d8d23a03e1442756876cc0605ec0d33584668',
  3: '26a1faafefac4102b17c41d2738ac5509602313eb5f94168fe36d722a8f1d75f',
  4: 'fe42caa994fa8b88066d37a35e60917208e8bd394113e278e1e4212e930255ad',
  5: '68dfc42ecf16277df605a0acfc574f608014acdaae3260565f989cc9010f3520',
};
export function RemoteAnimation({ animation, variant, onReady, onFailure, retry = 0 }: {
  animation: FigureDefinition['animation']; variant: number;
  onReady(variant: number, hash: string, file: RiveFile): void;
  onFailure?(variant: number): void;
  retry?: number;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [fileFailed, setFileFailed] = useState(false);
  const markFailure = useCallback((failed: number) => { setFileFailed(true); onFailure?.(failed); }, [onFailure]);
  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    cacheFigureAnimation(animation).then(uri => { if (active) setPath(uri); }).catch(() => {
      // Bounded retries do not replace a configured file or restart stationary pieces.
      if (active && attempt < 2) retryTimer = setTimeout(() => setAttempt(n => n + 1), 3000 * (attempt + 1));
      else if (active) onFailure?.(variant);
    });
    return () => { active = false; if (retryTimer) clearTimeout(retryTimer); };
  }, [animation, attempt, retry, variant, onFailure]);
  return path ? <LoadedAnimation key={fileFailed ? retry : 0} path={path} hash={animation.sha256} variant={variant} onReady={onReady} onFailure={markFailure} /> : null;
}
function LoadedAnimation({ path, hash, variant, onReady, onFailure }: { path: string; hash: string; variant: number; onReady(variant: number, hash: string, file: RiveFile): void; onFailure(variant: number): void }) {
  const { riveFile, error } = useRiveFile({ uri: path });
  useEffect(() => { if (riveFile) onReady(variant, hash, riveFile); }, [riveFile, variant, hash, onReady]);
  useEffect(() => { if (error) onFailure(variant); }, [error, variant, onFailure]);
  return null;
}
