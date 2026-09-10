import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

export function StatusBanner({ message, tone = 'neutral' }: { message: string; tone?: 'neutral' | 'error' | 'success' }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.container, tone === 'error' && styles.error, tone === 'success' && styles.success]}>
      <Text maxFontSizeMultiplier={2} style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: spacing.md },
  error: { borderColor: colors.danger },
  success: { borderColor: colors.success },
  text: { color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
});
