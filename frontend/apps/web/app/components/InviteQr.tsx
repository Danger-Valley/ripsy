import React from 'react';
import { createInviteQr } from '@rps/core/invite-qr';
export function InviteQr({ gameId }: { gameId: string }) {
  const qr = createInviteQr(gameId);
  return <svg role="img" aria-label={`Scan to join battle ${gameId}`} width="164" height="164" viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges">
    <rect width={qr.size} height={qr.size} fill="white" />
    <path fill="var(--toy-ink)" d={qr.runs.map(run => `M${run.x} ${run.y}h${run.width}v1h-${run.width}z`).join('')} />
  </svg>;
}
