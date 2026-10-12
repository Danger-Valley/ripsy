import { StyleSheet, Text, View } from 'react-native';
import { ToyHomeButton, homeFont } from './toy-home-controls';
import { colors, spacing } from '../theme';

/** Selection only. Changing quantity never prepares or signs a payment. */
export function FigureQuantity({ name, value, maximum, disabled, onChange }: {
  name: string; value: number; maximum: number; disabled: boolean; onChange(value: number): void;
}) {
  return <View style={styles.row}>
    <Text style={styles.label}>Quantity</Text>
    <View style={styles.controls}>
      <ToyHomeButton small tone="white" disabled={disabled || value <= 1} accessibilityLabel={`Fewer ${name} figures`} onPress={() => onChange(Math.max(1, value - 1))}>-</ToyHomeButton>
      <Text accessibilityLabel={`${name} quantity, ${value} of ${maximum}`} accessibilityLiveRegion="polite" style={styles.value}>{value}</Text>
      <ToyHomeButton small disabled={disabled || value >= maximum} accessibilityLabel={`More ${name} figures`} onPress={() => onChange(Math.min(maximum, value + 1))}>+</ToyHomeButton>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  label: { fontFamily: homeFont, color: colors.ink, fontSize: 17 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { minWidth: 36, textAlign: 'center', fontFamily: homeFont, color: colors.ink, fontSize: 24, fontVariant: ['tabular-nums'] },
});
