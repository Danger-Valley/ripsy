import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { haptics } from '../haptics';
import { colors, spacing } from '../theme';

type Props = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}>;

export function PrimaryButton({ children, onPress, disabled, busy, variant = 'primary', accessibilityLabel, accessibilityHint }: Props) {
  const isDisabled = Boolean(disabled || busy);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: Boolean(busy), disabled: isDisabled }}
      disabled={isDisabled}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        (isDisabled || pressed) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator accessibilityLabel="Loading" color={variant === 'primary' ? colors.background : colors.text} />
      ) : (
        <Text maxFontSizeMultiplier={2} style={[styles.label, variant !== 'primary' && styles.lightLabel]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  secondary: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: { backgroundColor: colors.danger },
  dimmed: { opacity: 0.55 },
  label: { color: colors.background, fontSize: 16, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  lightLabel: { color: colors.text },
});
