import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatClock } from './game-clocks';
import { colors, spacing } from '../theme';

export function LineupCountdown({ deadlineAt }: { deadlineAt: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  const remaining = Math.max(0, deadlineAt - now);
  const formatted = formatClock(remaining);
  const low = remaining <= 60_000;

  return (
    <View accessibilityLabel={`Time to save your lineup ${formatted}`} accessibilityRole="timer" style={[styles.badge, low && styles.badgeLow]} testID="lineup-countdown">
      <Text maxFontSizeMultiplier={1.5} style={[styles.label, low && styles.low]}>SAVE IN</Text>
      <Text maxFontSizeMultiplier={1.4} style={[styles.time, low && styles.low]}>{formatted}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'flex-end', gap: 2, borderRadius: 10, backgroundColor: colors.surfaceStrong, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeLow: { borderColor: colors.danger, borderWidth: 1 },
  label: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  time: { color: colors.primary, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  low: { color: colors.danger },
});
