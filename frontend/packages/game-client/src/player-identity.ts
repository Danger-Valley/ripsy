import { useEffect, useState } from 'react';
import { parseStoredSession, requestPlayerSession, sessionEndpointFromWebSocket, type PlayerSession } from './player-session';

const STORAGE_KEY = 'ripsy-player-session';
const webSocketEndpoint = () => process.env.NEXT_PUBLIC_GAME_WS_URL ?? 'ws://localhost:8080';
const sessionEndpoint = () => process.env.NEXT_PUBLIC_GAME_HTTP_URL ?? sessionEndpointFromWebSocket(webSocketEndpoint());
let browserSessionPromise: Promise<PlayerSession> | null = null;

export function getPlayerId(): string {
  if (typeof window === 'undefined') return '';
  return parseStoredSession(window.localStorage.getItem(STORAGE_KEY))?.playerId ?? '';
}

export function usePlayerIdentity() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadBrowserSession().then(nextSession => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      if (active) setSession(nextSession);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not create a player session');
    });
    return () => { active = false; };
  }, []);
  const playerId = session?.playerId ?? '';
  return { connected: Boolean(session), playerId, sessionToken: session?.token ?? '', error };
}

function loadBrowserSession() {
  const stored = parseStoredSession(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return Promise.resolve(stored);
  browserSessionPromise ??= requestPlayerSession(sessionEndpoint()).catch(error => {
    browserSessionPromise = null;
    throw error;
  });
  return browserSessionPromise;
}
