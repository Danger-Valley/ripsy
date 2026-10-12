import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { homeArt, homeFont } from './toy-home-controls';

const splashArtwork = require('../assets/ui/splash-playground-v1.png');

/** Finish actual restoration and local image loading, without a branding delay. */
export function StartupSplash({ onArtworkReady }: { onArtworkReady?: () => void }) {
  const settled = useRef(new Set<string>());
  const completed = useRef(false);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onArtworkReady?.();
  }, [onArtworkReady]);
  const imageSettled = (name: string) => {
    settled.current.add(name);
    if (settled.current.size === 2) finish();
  };
  useEffect(() => {
    if (!onArtworkReady) return;
    // Never block navigation if the native image loader loses a callback.
    const fallback = setTimeout(finish, 1500);
    return () => clearTimeout(fallback);
  }, [finish, onArtworkReady]);
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const insets = useSafeAreaInsets();
  const fitArtwork = Platform.OS === 'android';
  const { width, height } = fitArtwork && viewport ? viewport : window;
  const source = Image.resolveAssetSource(splashArtwork);
  const sourceWidth = source?.width ?? 0;
  const sourceHeight = source?.height ?? 0;
  const artworkRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 0.5;
  // Android windows vary with edge-to-edge, navigation mode and multi-window.
  // Aspect-fit to the ENTIRE measured view. Safe areas belong to foreground
  // content, not the illustration: reserving loading space shrinks the art.
  const availableHeight = Math.max(1, height);
  const availableWidth = Math.max(1, width);
  const artworkWidth = Math.min(availableWidth, availableHeight * artworkRatio);
  const artworkHeight = artworkWidth / artworkRatio;
  const artworkFrame = {
    position: 'absolute' as const,
    width: artworkWidth,
    height: artworkHeight,
    left: (availableWidth - artworkWidth) / 2,
    top: (availableHeight - artworkHeight) / 2,
  };
  const logoWidth = fitArtwork
    ? Math.min(artworkWidth * 0.78, 440, artworkHeight * 0.7)
    : Math.min(width * 0.78, 440, height * 0.7);
  const logoHeight = logoWidth / 2.5;
  return (
    <View testID="startup-splash" style={styles.screen} onLayout={({ nativeEvent: { layout } }) => {
      if (fitArtwork && layout.width > 0 && layout.height > 0) {
        setViewport(previous => previous?.width === layout.width && previous?.height === layout.height
          ? previous : { width: layout.width, height: layout.height });
      }
    }}>
      <Image
        source={splashArtwork}
        resizeMode={fitArtwork ? 'contain' : 'cover'}
        onLoadEnd={() => imageSettled('background')}
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
        onLoadEnd={() => imageSettled('logo')}
        style={[styles.logo, {
          width: logoWidth,
          height: logoHeight,
          ...(fitArtwork ? {
            left: artworkFrame.left + (artworkWidth - logoWidth) / 2,
            top: Math.max(insets.top + 16, artworkFrame.top + artworkHeight * 0.25 - logoHeight / 2),
          } : {
            top: Math.max(insets.top + 16, height * 0.25 - logoHeight / 2),
          }),
        }]}
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
  logo: { position: 'absolute' },
  loading: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 12 },
  caption: { color: colors.ink, fontFamily: homeFont, fontSize: 18, textAlign: 'center' },
});
