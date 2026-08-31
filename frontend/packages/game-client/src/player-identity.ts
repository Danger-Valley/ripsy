import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ripsy-player-id';

export function getPlayerId(): string {
  if (typeof window === 'undefined') return '';
  let playerId = window.localStorage.getItem(STORAGE_KEY);
  if (!playerId) {
    playerId = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, playerId);
  }
  return playerId;
}

export function usePlayerIdentity() {
  const [playerId, setPlayerId] = useState('');
  useEffect(() => setPlayerId(getPlayerId()), []);
  return { connected: Boolean(playerId), publicKey: playerId || null, playerId };
}
