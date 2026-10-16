import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { homeFont } from './toy-home-controls';

const splashArtwork = require('../assets/ui/splashscreen.png');

/** Finish actual restoration and local image loading, without a branding delay. */
export function StartupSplash({ onArtworkReady }: { onArtworkReady?: () => void }) {
  const completed = useRef(false);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onArtworkReady?.();
  }, [onArtworkReady]);
  useEffect(() => {
    if (!onArtworkReady) return;
    // Never block navigation if the native image loader loses a callback.
    const fallback = setTimeout(finish, 1500);
    return () => clearTimeout(fallback);
  }, [finish, onArtworkReady]);
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = viewport ?? window;
  // RN Image supplies intrinsic asset width/height before our style. Explicit
  // viewport bounds must override those defaults; edge constraints alone do not.
  const imageSize = { width: Math.max(1, width), height: Math.max(1, height) };
  return (
    <View testID="startup-splash" style={styles.screen} onLayout={({ nativeEvent: { layout } }) => {
      if (layout.width > 0 && layout.height > 0) {
        setViewport(previous => previous?.width === layout.width && previous?.height === layout.height
          ? previous : { width: layout.width, height: layout.height });
      }
    }}>
      <Image
        source={splashArtwork}
        resizeMode="cover"
        onLoadEnd={finish}
        accessibilityLabel="RIPSY"
        accessible
        style={[styles.artwork, imageSize]}
      />
      <View testID="startup-loading" style={[styles.loading, { bottom: insets.bottom + 32 }]}>
        <Text maxFontSizeMultiplier={1.6} style={styles.caption}>Opening the toy box…</Text>
        <ActivityIndicator accessibilityLabel="Loading RIPSY" accessibilityRole="progressbar" color={colors.ink} size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden', alignItems: 'center' },
  artwork: { position: 'absolute', left: 0, top: 0 },
  loading: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 12 },
  caption: { color: colors.ink, fontFamily: homeFont, fontSize: 18, textAlign: 'center' },
});
