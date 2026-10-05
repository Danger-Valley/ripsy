import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { homeArt, homeFont } from './toy-home-controls';

/** Real navigation restoration only: no artificial delay or pretend progress. */
export function StartupSplash() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const logoWidth = Math.min(width * 0.78, 440, height * 0.7);
  const logoHeight = logoWidth / 2.5;
  return (
    <View testID="startup-splash" style={styles.screen}>
      <Image
        source={require('../assets/ui/splash-playground-v1.png')}
        resizeMode="cover"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={homeArt.logo}
        accessibilityLabel="RIPSY"
        accessible
        resizeMode="contain"
        style={[styles.logo, {
          width: logoWidth,
          height: logoHeight,
          top: Math.max(insets.top + 16, height * 0.25 - logoHeight / 2),
        }]}
      />
      <View style={[styles.loading, { bottom: insets.bottom + 32 }]}>
        <Text maxFontSizeMultiplier={1.6} style={styles.caption}>Opening the toy box…</Text>
        <ActivityIndicator accessibilityLabel="Loading RIPSY" accessibilityRole="progressbar" color={colors.ink} size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden', alignItems: 'center' },
  logo: { position: 'absolute' },
  loading: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 12 },
  caption: { color: colors.ink, fontFamily: homeFont, fontSize: 18, textAlign: 'center' },
});
