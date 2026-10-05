import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Phase, type GameState } from '@rps/core';
import { AppState } from 'react-native';
import { sounds } from '../audio/sounds';
import type { SoundName } from '../audio/sound-engine';

export function useBattleSounds() {
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  useEffect(() => { if (!focused) sounds.stopAll(); return () => { sounds.stopAll(); }; }, [focused]);
  // Stable through clock/queue rerenders: never destabilize a Rive callback.
  return useCallback((name: SoundName) => { if (focusedRef.current) sounds.play(name); }, []);
}

export function useBattleResultSound(state: GameState | null, busy: boolean, playerId: string) {
  const focused = useIsFocused();
  const observed = useRef<{ gameId: string; live: boolean; consumed: boolean } | null>(null);
  const pendingState = useRef(state);
  pendingState.current = state;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active' && pendingState.current?.phase === Phase.Finished && observed.current) observed.current.consumed = true;
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!state) return;
    if (observed.current?.gameId !== state.gameId) {
      observed.current = { gameId: state.gameId, live: state.phase !== Phase.Finished, consumed: state.phase === Phase.Finished };
      return; // Restoring an already-finished room is never a new celebration.
    }
    const event = observed.current;
    if (state.phase !== Phase.Finished) { event.live = true; return; }
    if (event.consumed) return;
    if (!focused || !sounds.isActive()) { event.consumed = true; return; }
    if (busy) return;
    event.consumed = true;
    if (!event.live || state.finishReason === 'lineup_timeout' || !state.winner
      || (playerId !== state.p0 && playerId !== state.p1)) return;
    sounds.play(state.winner === playerId ? 'victory' : 'defeat');
  }, [state, busy, playerId, focused]);
}
