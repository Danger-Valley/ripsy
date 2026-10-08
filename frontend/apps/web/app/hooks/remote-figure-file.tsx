"use client";
import { useEffect, useState } from 'react';
import { useRiveFile } from '@rive-app/react-canvas';
import type { FigureDefinition } from '@rps/core/figure-manifest';

export function RemoteFigureFile({ figure, onReady }: { figure: FigureDefinition; onReady(variant: number, hash: string, file: unknown): void }) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let active = true;
    (async () => {
      const cache = typeof caches === 'undefined' ? null : await caches.open('ripsy-figure-files-v1').catch(() => null);
      const cached = await cache?.match(figure.animation.url);
      const response = cached ?? await fetch(figure.animation.url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Fighter unavailable');
      const reader = response.body?.getReader();
      let data: ArrayBuffer;
      if (reader) {
        const chunks: Uint8Array[] = []; let length = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.byteLength;
          if (length > figure.animation.bytes) { await reader.cancel(); throw new Error('Fighter asset too large'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        data = bytes.buffer;
      } else data = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (data.byteLength !== figure.animation.bytes || hash !== figure.animation.sha256) {
        await cache?.delete(figure.animation.url); throw new Error('Invalid fighter asset');
      }
      if (!cached && cache) {
        await cache.put(figure.animation.url, new Response(data));
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - 32))) await cache.delete(old);
      }
      if (active) setBytes(data);
    })().catch(() => undefined).finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  // Only resource identity changes reload a file, not clock/catalog metadata updates.
  }, [figure.animation.url, figure.animation.sha256, figure.animation.bytes]); // eslint-disable-line react-hooks/exhaustive-deps
  return bytes ? <Loaded bytes={bytes} figure={figure} onReady={onReady} /> : null;
}
function Loaded({ bytes, figure, onReady }: { bytes: ArrayBuffer; figure: FigureDefinition; onReady(variant: number, hash: string, file: unknown): void }) {
  const { riveFile } = useRiveFile({ buffer: bytes });
  useEffect(() => { if (riveFile) onReady(figure.variant, figure.animation.sha256, riveFile); }, [riveFile, figure.variant, figure.animation.sha256, onReady]);
  return null;
}
