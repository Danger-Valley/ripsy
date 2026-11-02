import { useCallback, useEffect, useState } from 'react';
import { useRiveFile, type RiveFile } from '@rive-app/react-native';
import type { FigureDefinition } from '@rps/core/figure-manifest';
import { cacheFigureAnimation } from './asset-cache';

export { bundledHashes } from './bundled-resources';
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
