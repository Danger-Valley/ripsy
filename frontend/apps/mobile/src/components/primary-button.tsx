import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';

type Props = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}>;

export function PrimaryButton({ children, onPress, disabled, busy, variant = 'primary' }: Props) {
  const isDisabled = Boolean(disabled || busy);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        (isDisabled || pressed) && styles.dimmed,
      ]}>
      {busy ? <ActivityIndicator color={variant === 'primary' ? colors.background : colors.text} /> : <Text style={[styles.label, variant !== 'primary' && styles.lightLabel]}>{children}</Text>}
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
  },
  secondary: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: { backgroundColor: colors.danger },
  dimmed: { opacity: 0.55 },
  label: { color: colors.background, fontSize: 16, fontWeight: '800' },
  lightLabel: { color: colors.text },
});
