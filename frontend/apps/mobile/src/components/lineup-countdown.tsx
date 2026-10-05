import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatClock } from './game-clocks';
import { colors, spacing } from '../theme';
import { homeFont } from './toy-home-controls';

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
  badge: { alignItems: 'center', gap: 2, borderRadius: 12, backgroundColor: colors.rewardHighlight, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeLow: { backgroundColor: colors.primaryMuted },
  label: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  time: { color: colors.ink, fontFamily: homeFont, fontSize: 20, fontVariant: ['tabular-nums'] },
  low: { color: colors.dangerShadow },
});
