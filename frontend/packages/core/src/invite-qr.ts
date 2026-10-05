/// <reference path="./qrcode.d.ts" />
import { createGameInviteUrl } from './invitations';
// Only the pure matrix encoder: no filesystem, canvas, PNG or native module.
import { create } from 'qrcode/lib/core/qrcode.js';
export interface InviteQr { size: number; quietZone: number; runs: Array<{ x: number; y: number; width: number }> }
export function createInviteQr(gameId: string): InviteQr {
  // Canonical invitations are ASCII. Byte segments avoid TextEncoder on Hermes.
  const url = createGameInviteUrl(gameId);
  const { modules } = create([{ data: Uint8Array.from(url, char => char.charCodeAt(0)), mode: 'byte' }], { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const runs: InviteQr['runs'] = [];
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size;) {
      if (!modules.data[y * modules.size + x]) { x++; continue; }
      const start = x;
      while (x < modules.size && modules.data[y * modules.size + x]) x++;
      runs.push({ x: start + quietZone, y: y + quietZone, width: x - start });
    }
  }
  return { size: modules.size + quietZone * 2, quietZone, runs };
}
