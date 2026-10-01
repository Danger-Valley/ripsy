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
  container: { backgroundColor: colors.kitPanel, borderColor: colors.kitPanelBorder, borderTopWidth: 2, borderBottomWidth: 5, borderBottomColor: colors.kitPanelShadow, borderRadius: 18, padding: spacing.md },
  error: { borderTopColor: colors.dangerHighlight, borderBottomColor: colors.dangerShadow },
  success: { borderTopColor: colors.kitLimeHighlight, borderBottomColor: colors.kitLimeShadow },
  text: { color: colors.kitPanelInk, textAlign: 'center', fontWeight: '800' },
});
