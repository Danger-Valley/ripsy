import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { haptics } from '../haptics';
import { colors, radii, spacing } from '../theme';

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
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
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
    minHeight: 58,
    borderRadius: radii.control,
    backgroundColor: colors.primary,
    borderColor: colors.primaryHighlight,
    borderTopWidth: 2,
    borderBottomColor: colors.primaryShadow,
    borderBottomWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  secondary: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderTopWidth: 2,
    borderBottomColor: colors.background,
    borderBottomWidth: 6,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.dangerHighlight,
    borderBottomColor: colors.dangerShadow,
  },
  pressed: {
    transform: [{ translateY: 4 }],
    borderBottomWidth: 2,
    shadowOpacity: 0.12,
    elevation: 2,
  },
  disabled: { opacity: 0.48 },
  label: { color: colors.background, fontSize: 16, fontWeight: '900', letterSpacing: 0.2, flexShrink: 1, textAlign: 'center' },
  lightLabel: { color: colors.text },
});
