import type { CSSProperties } from 'react';

export function PlayerBadge({ playerId, style }: { playerId: string; style?: CSSProperties }) {
  const label = playerId ? `Player ${playerId.slice(0, 4)}…${playerId.slice(-4)}` : 'Creating player…';
  return (
    <span style={{ padding: '8px 12px', color: '#c5c6c7', background: '#172129', border: '1px solid #2b3a44', borderRadius: 8, fontSize: 13, ...style }}>
      {label}
    </span>
  );
}
