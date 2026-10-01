import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { haptics } from '../haptics';
import { colors, radii, spacing } from '../theme';

type Props = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'reward';
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
        variant === 'reward' && styles.reward,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      <PressableHighlight />
      {busy ? (
        <ActivityIndicator accessibilityLabel="Loading" color={variant === 'danger' ? colors.text : colors.kitPanelInk} />
      ) : (
        <Text maxFontSizeMultiplier={2} style={[styles.label, variant === 'danger' && styles.dangerLabel]}>{children}</Text>
      )}
    </Pressable>
  );
}

function PressableHighlight() {
  return <View pointerEvents="none" style={styles.highlight} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: radii.control,
    backgroundColor: colors.kitLime,
    borderColor: colors.kitLimeHighlight,
    borderTopWidth: 2,
    borderBottomColor: colors.kitLimeShadow,
    borderBottomWidth: 6,
    overflow: 'hidden',
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
    backgroundColor: colors.kitPanel,
    borderColor: colors.kitPanelBorder,
    borderTopWidth: 2,
    borderBottomColor: colors.kitPanelShadow,
    borderBottomWidth: 6,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.dangerHighlight,
    borderBottomColor: colors.dangerShadow,
  },
  reward: {
    backgroundColor: colors.reward,
    borderColor: colors.rewardHighlight,
    borderBottomColor: colors.rewardShadow,
  },
  pressed: {
    transform: [{ translateY: 4 }],
    borderBottomWidth: 2,
    shadowOpacity: 0.12,
    elevation: 2,
  },
  disabled: { opacity: 0.68 },
  highlight: { position: 'absolute', top: 3, left: 18, right: 18, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  label: { color: colors.ink, fontSize: 16, fontWeight: '900', letterSpacing: 0.2, flexShrink: 1, textAlign: 'center' },
  dangerLabel: { color: colors.text },
});
