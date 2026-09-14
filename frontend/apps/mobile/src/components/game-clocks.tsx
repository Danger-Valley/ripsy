import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GAME_CLOCK_INITIAL_MS, Owner, Phase, type GameState } from '@rps/core';
import { colors, spacing } from '../theme';

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
      <Clock label="YOU" milliseconds={mine} running={myClockRunning} />
      <Clock label="OPPONENT" milliseconds={opponent} running={opponentClockRunning} />
    </View>
  );
}

function Clock({ label, milliseconds, running }: { label: string; milliseconds: number; running: boolean }) {
  const low = milliseconds <= 60_000;
  const formatted = formatClock(milliseconds);
  return (
    <View
      accessibilityLabel={`${label === 'YOU' ? 'Your' : 'Opponent'} time ${formatted}${running ? ', running' : ', paused'}`}
      style={[styles.clock, running && styles.clockRunning, low && styles.clockLow]}
    >
      <View style={styles.labelRow}>
        <View style={[styles.dot, running && styles.dotRunning, low && styles.dotLow]} />
        <Text maxFontSizeMultiplier={1.6} style={[styles.label, running && styles.labelRunning, low && styles.labelLow]}>{label}</Text>
      </View>
      <Text maxFontSizeMultiplier={1.4} style={[styles.time, low && styles.timeLow]}>{formatted}</Text>
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
  clock: { flex: 1, minHeight: 76, justifyContent: 'space-between', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  clockRunning: { backgroundColor: colors.surfaceStrong, borderColor: colors.primary },
  clockLow: { borderColor: colors.danger },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textMuted },
  dotRunning: { backgroundColor: colors.primary },
  dotLow: { backgroundColor: colors.danger },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  labelRunning: { color: colors.primary },
  labelLow: { color: colors.danger },
  time: { color: colors.text, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timeLow: { color: colors.danger },
});
