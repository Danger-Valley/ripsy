import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const storageKey = 'ripsy-player-id';

export function usePlayerIdentity() {
  const [playerId, setPlayerId] = useState('');

  useEffect(() => {
    let active = true;
    const loadIdentity = async () => {
      const storedId = await AsyncStorage.getItem(storageKey);
      const identity = storedId || createPrototypePlayerId();
      if (!storedId) await AsyncStorage.setItem(storageKey, identity);
      if (active) setPlayerId(identity);
    };
    loadIdentity().catch(() => {
      if (active) setPlayerId(createPrototypePlayerId());
    });
    return () => {
      active = false;
    };
  }, []);

  return { playerId, isReady: Boolean(playerId) };
}

function createPrototypePlayerId() {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
