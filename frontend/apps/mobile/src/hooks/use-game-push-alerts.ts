import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { subscribeToForegroundGamePush, type GamePushNotification } from '../push-notifications';

// Server dispatch must not depend on socket connectivity: Home and other
// battles can have a socket open too. Suppression is per foreground screen.
export function useGamePushAlerts(visibleGameId: string | null) {
  const [notification, setNotification] = useState<GamePushNotification | null>(null);
  const visibleGameRef = useRef(visibleGameId);
  visibleGameRef.current = visibleGameId;
  const seenDeliveries = useRef(new Set<string>());

  useEffect(() => {
    const unsubscribe = subscribeToForegroundGamePush(next => {
      // Background/quit alerts belong to the OS, never a duplicate local alert.
      if (AppState.currentState !== 'active') return;
      if (next.deliveryId) {
        if (seenDeliveries.current.has(next.deliveryId)) return;
        seenDeliveries.current.add(next.deliveryId);
        if (seenDeliveries.current.size > 100) {
          const oldest = seenDeliveries.current.values().next().value;
          if (oldest) seenDeliveries.current.delete(oldest);
        }
      }
      if (visibleGameRef.current === next.gameId) return;
      setNotification(next);
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setNotification(null);
    });
    return () => { unsubscribe(); subscription.remove(); };
  }, []);

  useEffect(() => {
    if (visibleGameId) {
      setNotification(current => current?.gameId === visibleGameId ? null : current);
    }
  }, [visibleGameId]);

  const dismiss = useCallback(() => setNotification(null), []);
  // Hide immediately in the navigation render, not a frame later in an effect.
  return { notification: notification?.gameId === visibleGameId ? null : notification, dismiss };
}
