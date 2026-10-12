import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { homeFont } from './toy-home-controls';

export function StatusBanner({ message, tone = 'neutral' }: { message: string; tone?: 'neutral' | 'warning' | 'error' | 'success' }) {
  const symbol = tone === 'success' ? '★' : tone === 'error' || tone === 'warning' ? '!' : '●';
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.container, tone === 'warning' && styles.warning, tone === 'error' && styles.error, tone === 'success' && styles.success]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.icon, tone === 'warning' && styles.iconWarning, tone === 'error' && styles.iconError, tone === 'success' && styles.iconSuccess]}>
        <Text style={styles.iconText}>{symbol}</Text>
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceHighlight, borderRadius: 16, padding: spacing.md },
  warning: { backgroundColor: colors.rewardHighlight },
  error: { backgroundColor: colors.primaryMuted },
  success: { backgroundColor: colors.kitSuccessSoft },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentHighlight },
  iconWarning: { backgroundColor: colors.warning },
  iconError: { backgroundColor: colors.primaryHighlight },
  iconSuccess: { backgroundColor: colors.rewardHighlight },
  iconText: { color: colors.ink, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  text: { flex: 1, color: colors.kitPanelInk, fontFamily: homeFont, fontSize: 14, lineHeight: 20 },
});
