import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { sounds } from '../audio/sounds';

export function useSoundLifecycle() {
  useEffect(() => {
    sounds.setActive(AppState.currentState === 'active');
    sounds.start().catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => sounds.setActive(state === 'active'));
    return () => { subscription.remove(); sounds.shutdown(); };
  }, []);
}

export function useSounds() { return useSyncExternalStore(sounds.subscribe, sounds.snapshot, sounds.snapshot); }
