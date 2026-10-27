import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

/** Keep the official native branding; do not import the Android module on iOS. */
export function SeekerConnectAction({ onPress, busy = false, disabled = false,
  accessibilityLabel = 'Connect with Seeker', accessibilityHint = 'Opens your Seeker wallet to connect it',
}: {
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  if (Platform.OS !== 'android') return null;
  const Button = (require('@solana-mobile/seeker-connect-react-native') as typeof import('@solana-mobile/seeker-connect-react-native')).SeekerConnectButton;
  const blocked = disabled || busy;
  return <View style={styles.content}>
    <Button theme="light" enabled={!blocked} style={styles.button} accessibilityRole="button"
      accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy }}
      onPress={() => { if (!blocked) onPress(); }} />
    {busy && <View style={styles.progress}>
      <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel="Connecting with Seeker" color={colors.ink} />
      <Text accessibilityLiveRegion="polite" style={styles.copy}>Connecting with Seeker…</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  button: { height: 56, width: '100%' },
  progress: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  copy: { color: colors.textMuted, fontSize: 13 },
});
