import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GAME_CLOCK_INITIAL_MS, Owner, Phase, type GameState } from '@rps/core';
import { colors, spacing } from '../theme';
import { homeFont, ToyShine } from './toy-home-controls';
import { BattlePortrait } from './toy-battle-shell';

export function GameClocks({ state, ownOwner }: { state: GameState; ownOwner: Owner }) {
  const snapshotAt = useRef(Date.now());
  const [now, setNow] = useState(snapshotAt.current);

  useEffect(() => {
    snapshotAt.current = Date.now();
    setNow(snapshotAt.current);
  }, [state.clock0Ms, state.clock1Ms, state.clockRunning, state.phase]);

  useEffect(() => {
    if (state.phase !== Phase.Active || state.clockRunning === Owner.None) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [state.clockRunning, state.phase]);

  const elapsed = state.phase === Phase.Active ? Math.max(0, now - snapshotAt.current) : 0;
  const p0 = Math.max(0, (state.clock0Ms ?? GAME_CLOCK_INITIAL_MS) - (state.clockRunning === Owner.P0 ? elapsed : 0));
  const p1 = Math.max(0, (state.clock1Ms ?? GAME_CLOCK_INITIAL_MS) - (state.clockRunning === Owner.P1 ? elapsed : 0));
  const mine = ownOwner === Owner.P1 ? p1 : p0;
  const opponent = ownOwner === Owner.P1 ? p0 : p1;
  const myClockRunning = state.clockRunning === ownOwner && state.phase === Phase.Active;
  const opponentClockRunning = state.clockRunning !== Owner.None && state.clockRunning !== ownOwner && state.phase === Phase.Active;

  // Keep the finished snapshot mounted so the board does not jump upward when
  // the status banner switches to the game-over result.
  if (state.phase !== Phase.Active && state.phase !== Phase.Finished) return null;

  return (
    <View accessibilityRole="timer" style={styles.row} testID="game-clocks">
      <Clock label="YOU" milliseconds={mine} running={myClockRunning} remaining={ownOwner === Owner.P1 ? state.live1 : state.live0} isMine />
      <Clock label="OPPONENT" milliseconds={opponent} running={opponentClockRunning} remaining={ownOwner === Owner.P1 ? state.live0 : state.live1} />
    </View>
  );
}

function Clock({ label, milliseconds, running, remaining, isMine = false }: { label: string; milliseconds: number; running: boolean; remaining: number; isMine?: boolean }) {
  const low = milliseconds <= 60_000;
  const formatted = formatClock(milliseconds);
  return (
    <View
      accessible
      accessibilityLabel={`${label === 'YOU' ? 'Your' : 'Opponent'} time ${formatted}${running ? ', running' : ', paused'}`}
      style={[styles.clock, isMine ? styles.clockMine : styles.clockOpponent]}
    >
      <View style={styles.clockFace} testID={isMine ? 'clock-face-you' : 'clock-face-opponent'}>
        <ToyShine top={isMine ? '#16D5F7' : '#FF656A'} bottom={isMine ? colors.accent : colors.primary} />
        <View style={styles.clockHeader}>
          <Text maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.label}>{label}</Text>
        </View>
        <View style={styles.clockContent}>
          <BattlePortrait opponent={!isMine} />
          <View style={styles.timeCopy}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.remaining}>{remaining} fighters</Text>
            <Text maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.time, low && styles.timeLow]}>{formatted}</Text>
          </View>
        </View>
        {running && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.turnTab}><Text style={styles.turnTabText}>TURN</Text></View>}
        {/* Paint the uniform rounded outline ABOVE the gradient, not beneath it.
            The darker base is separate so unequal border widths cannot split
            the corner arcs on iOS or Android. */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={isMine ? 'clock-outline-you' : 'clock-outline-opponent'} style={styles.clockOutline} />
      </View>
    </View>
  );
}

export function formatClock(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  clock: { position: 'relative', flex: 1, minWidth: 0, minHeight: 104, borderRadius: 20, paddingBottom: 4, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 3 },
  clockMine: { backgroundColor: colors.accentShadow },
  clockOpponent: { backgroundColor: colors.primaryShadow },
  clockFace: { flex: 1, minHeight: 100, borderRadius: 20, overflow: 'hidden', padding: 6, gap: 3 },
  clockOutline: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 20, borderWidth: 2, borderColor: colors.kitPanel },
  clockHeader: { minHeight: 22, justifyContent: 'center', paddingHorizontal: 26 },
  clockContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, padding: 5, backgroundColor: colors.kitPanel, borderRadius: 14 },
  timeCopy: { flex: 1, minWidth: 0, gap: 1 },
  label: { color: colors.ink, fontFamily: homeFont, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  remaining: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  time: { color: colors.ink, fontFamily: homeFont, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timeLow: { color: colors.dangerShadow },
  turnTab: { position: 'absolute', top: 10, right: 8, backgroundColor: colors.reward, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2 },
  turnTabText: { color: colors.ink, fontSize: 6, fontWeight: '900', letterSpacing: 0.4 },
});
