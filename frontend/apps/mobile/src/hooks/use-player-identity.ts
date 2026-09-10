import { useEffect, useState } from 'react';
import * as Keychain from 'react-native-keychain';
import { parseStoredSession, requestPlayerSession, sessionEndpointFromWebSocket, type PlayerSession } from '@rps/game-client/session';
import { getGameWebSocketUrl } from '../config';

const keychainService = 'com.dangervalley.ripsy.player-session';

export function usePlayerIdentity() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadIdentity = async () => {
      const credentials = await Keychain.getGenericPassword({ service: keychainService });
      const storedSession = parseStoredSession(credentials ? credentials.password : null);
      const nextSession = storedSession ?? await requestPlayerSession(sessionEndpointFromWebSocket(getGameWebSocketUrl()));
      if (!storedSession) {
        await Keychain.setGenericPassword('ripsy-player', JSON.stringify(nextSession), {
          service: keychainService,
          accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
      }
      if (active) setSession(nextSession);
    };
    loadIdentity().catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not create a player session');
    });
    return () => {
      active = false;
    };
  }, []);

  return { playerId: session?.playerId ?? '', sessionToken: session?.token ?? '', isReady: Boolean(session), error };
}
