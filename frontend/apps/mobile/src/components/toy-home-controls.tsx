import { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { haptics } from '../haptics';
import { sounds } from '../audio/sounds';
import { colors } from '../theme';

export const homeArt = {
  rivals: require('../assets/ui/home-rivals.png'),
  logo: require('../assets/ui/ripsy-toy-logo.png'),
  swords: require('../assets/ui/home-swords.png'),
  robot: require('../assets/ui/home-robot.png'),
  players: require('../assets/ui/home-players.png'),
  army: require('../assets/ui/home-army.png'),
  shop: require('../assets/ui/home-shop.png'),
  settings: require('../assets/ui/home-settings.png'),
};

export const homeFont = Platform.select({ ios: 'ArialRoundedMTBold', android: 'sans-serif-medium' });
const palette = {
  yellow: ['#FFF17B', '#FFC900', '#FFA400', '#CB7800'],
  blue: ['#80EDFF', '#16D5F7', '#02B6E0', '#007CA9'],
  coral: ['#FFADA8', '#FF656A', '#FF424E', '#C42C3B'],
  green: ['#A3FBB6', '#22DE68', '#0FC84E', '#069F3C'],
  white: ['#FFFFFF', '#F5FAF8', '#E9F1EF', '#A9C4C9'],
} as const;

const gradientArt: Record<string, ImageSourcePropType> = {
  '#FFC900': require('../assets/ui/home-gradient-yellow.png'),
  '#16D5F7': require('../assets/ui/home-gradient-blue.png'),
  '#FF656A': require('../assets/ui/home-gradient-coral.png'),
  '#22DE68': require('../assets/ui/home-gradient-green.png'),
  '#F5FAF8': require('../assets/ui/home-gradient-white.png'),
  '#FFFFFF': require('../assets/ui/home-gradient-panel.png'),
  '#48D1F0': require('../assets/ui/home-gradient-sky.png'),
};

/** Tiny code-generated PNG ramps avoid fractional-pixel seams on native screens. */
export function ToyShine({ top, bottom }: { top: string; bottom: string }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: bottom }]}>
      <Image source={gradientArt[top]} resizeMode="stretch" style={styles.gradientImage} />
    </View>
  );
}

type Props = PropsWithChildren<{
  onPress: () => void;
  tone?: keyof typeof palette;
  icon?: ImageSourcePropType;
  tile?: boolean;
  small?: boolean;
  compact?: boolean;
  stacked?: boolean;
  disabled?: boolean;
  busy?: boolean;
  sound?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}>;

export function ToyHomeButton({ children, onPress, tone = 'blue', icon, tile, small, compact, stacked, disabled, busy, sound = true, accessibilityLabel, accessibilityHint, style, labelStyle }: Props) {
  const [focused, setFocused] = useState(false);
  const [highlight, top, bottom, edge] = palette[tone];
  const unavailable = Boolean(disabled || busy);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: unavailable, busy: Boolean(busy) }}
      disabled={unavailable}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => { if (unavailable) return; haptics.select(); if (sound) sounds.play('click'); onPress(); }}
      style={({ pressed }) => [styles.button, { backgroundColor: edge, borderColor: edge }, tile && styles.tile, small && styles.small, compact && styles.compact, style, pressed && !unavailable && styles.pressed, unavailable && styles.disabled]}>
      <View pointerEvents="none" style={[styles.face, { borderColor: highlight }, tile && styles.tileFace, small && styles.smallFace, compact && styles.compactFace, stacked && styles.stackedFace]}>
        <ToyShine top={top} bottom={bottom} />
        <View style={styles.specular} />
          <>
            {busy ? <ActivityIndicator accessibilityLabel="Loading" color={colors.ink} /> : icon && <Image source={icon} resizeMode="contain" style={[styles.icon, tile && styles.tileIcon, small && styles.smallIcon, stacked && styles.stackedIcon]} />}
            {children != null && <Text maxFontSizeMultiplier={1.6} style={[styles.label, tile && styles.tileLabel, compact && styles.compactLabel, stacked && styles.stackedLabel, (tone === 'coral' || tile) && styles.lightLabel, labelStyle]}>{children}</Text>}
          </>
      </View>
      {focused && <View pointerEvents="none" testID="toy-button-focus" style={[StyleSheet.absoluteFill, styles.focus, small && styles.smallFocus, compact && styles.compactFocus]} />}
    </Pressable>
  );
}

export function ToyHomePanel({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.panel, style]}>
      <View pointerEvents="none" style={styles.panelFill}><ToyShine top="#FFFFFF" bottom="#EAF2EF" /></View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gradientImage: { width: '100%', height: '100%' },
  button: { minHeight: 70, borderRadius: 21, borderWidth: 1, paddingBottom: 5, shadowColor: '#15485B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  face: { minHeight: 63, flex: 1, overflow: 'hidden', borderRadius: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  specular: { position: 'absolute', top: 2, left: 13, right: 13, height: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  label: { color: '#07345C', fontFamily: homeFont, fontSize: 22, fontWeight: '900', flexShrink: 1, textAlign: 'center' },
  icon: { width: 43, height: 43 },
  lightLabel: { color: '#FFFFFF', textShadowColor: 'rgba(0,67,104,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  tile: { flex: 1, minHeight: 94 },
  tileFace: { minHeight: 87, paddingHorizontal: 9, gap: 2 },
  tileIcon: { width: 68, height: 73 },
  tileLabel: { fontSize: 24 },
  small: { height: 46, minHeight: 46, width: 46, borderRadius: 14, paddingBottom: 3 },
  smallFace: { flex: 0, height: 41, minHeight: 41, borderRadius: 13, paddingHorizontal: 4, paddingVertical: 4, gap: 0 },
  smallIcon: { width: 28, height: 28 },
  compact: { minHeight: 48, borderRadius: 14, paddingBottom: 4 },
  compactFace: { minHeight: 43, borderRadius: 13, paddingHorizontal: 8, paddingVertical: 6 },
  compactLabel: { fontSize: 16 },
  stackedFace: { minHeight: 140, flexDirection: 'column', paddingHorizontal: 4, gap: 8 },
  stackedIcon: { width: 64, height: 64 },
  stackedLabel: { fontSize: 16 },
  pressed: { transform: [{ translateY: 3 }], shadowOpacity: 0.12 },
  focus: { borderWidth: 2, borderColor: colors.ink, borderRadius: 21 },
  smallFocus: { borderRadius: 14 },
  compactFocus: { borderRadius: 14 },
  disabled: { opacity: 0.65 },
  panel: { borderRadius: 22, borderWidth: 1.5, borderColor: '#FFFFFF', backgroundColor: '#F4F9F6', padding: 12, shadowColor: '#254F52', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 },
  panelFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 21 },
});
