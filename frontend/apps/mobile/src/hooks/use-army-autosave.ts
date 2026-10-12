import { useCallback, useEffect, useRef, useState } from 'react';

type SaveTask = { run(): Promise<void>; generation: number };
type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; error: string | null };

/** One writer; rapid edits replace only the next queued snapshot, never the active one. */
export function useArmyAutosave() {
  const [state, setState] = useState<SaveState>({ status: 'idle', error: null });
  const mounted = useRef(true);
  const generation = useRef(0);
  const pending = useRef<SaveTask | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const failure = useRef<Error | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const publish = useCallback((next: SaveState) => { if (mounted.current) setState(next); }, []);
  const start = useCallback(function startWorker(): Promise<void> {
    if (running.current) return running.current;
    if (!pending.current) return Promise.resolve();
    failure.current = null;
    publish({ status: 'saving', error: null });
    const work = Promise.resolve().then(async () => {
      while (pending.current) {
        const task = pending.current;
        pending.current = null;
        try { await task.run(); }
        catch (cause) {
          if (task.generation !== generation.current) continue;
          pending.current ??= task;
          failure.current = cause instanceof Error ? cause : new Error('Could not save your army.');
          publish({ status: 'error', error: failure.current.message });
          throw failure.current;
        }
        if (task.generation === generation.current && !pending.current) publish({ status: 'saved', error: null });
      }
    }).finally(() => {
      running.current = null;
      // Catch an edit arriving between the last await and worker cleanup.
      if (pending.current && !failure.current) startWorker().catch(() => undefined);
    });
    running.current = work;
    return work;
  }, [publish]);
  const enqueue = useCallback((run: SaveTask['run']) => {
    pending.current = { run, generation: generation.current };
    failure.current = null;
    publish({ status: 'saving', error: null });
    start().catch(() => undefined);
  }, [publish, start]);
  const retry = useCallback(() => { start().catch(() => undefined); }, [start]);
  const flush = useCallback(async () => {
    while (running.current) {
      try { await running.current; }
      catch (cause) { if (failure.current) throw cause; } // Reset invalidated an old session's failure.
    }
    if (failure.current) throw failure.current;
  }, []);
  const reset = useCallback(() => {
    generation.current += 1;
    pending.current = null;
    failure.current = null;
    publish({ status: 'idle', error: null });
  }, [publish]);
  const hasPending = useCallback(() => Boolean(running.current || pending.current), []);
  return { ...state, enqueue, retry, flush, reset, hasPending };
}
