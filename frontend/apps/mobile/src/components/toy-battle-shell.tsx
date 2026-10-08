import { useState, type PropsWithChildren } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from './toy-home-controls';
import { BattleGuideDialog } from './settings-dialogs';
import { HomePortraitImage } from './home-portrait';

const scenery = require('../assets/ui/battle-playground.png');

export function BattlePortrait({ opponent = false }: { opponent?: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.portrait, opponent && styles.portraitOpponent]}>
      <HomePortraitImage opponent={opponent} />
    </View>
  );
}

/** The scenery never owns hit targets or clips the board's Rive artwork. */
export function ToyBattleShell({ children, title, onBack }: PropsWithChildren<{ title: string; onBack: () => void }>) {
  const insets = useSafeAreaInsets();
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <View style={styles.screen}>
      <Image pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={scenery} style={styles.scenery} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <ToyHomeButton small tone="white" accessibilityLabel="Back to home" onPress={onBack}>‹</ToyHomeButton>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={styles.title}>{title}</Text>
        <ToyHomeButton small icon={homeArt.settings} accessibilityLabel="Battle guide" onPress={() => setGuideOpen(true)} />
      </View>
      <View style={styles.body}>{children}</View>
      <BattleGuideDialog visible={guideOpen} onClose={() => setGuideOpen(false)} />
    </View>
  );
}

export function BattleStatus({ message, tone = 'neutral', opponent = false }: { message: string; tone?: 'neutral' | 'success' | 'error'; opponent?: boolean }) {
  return (
    <ToyHomePanel style={[styles.status, tone === 'error' && styles.statusError]}>
      <BattlePortrait opponent={opponent} />
      <Text accessibilityRole="text" accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.8} style={styles.statusCopy}>{message}</Text>
    </ToyHomePanel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scenery: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { flex: 1, color: colors.ink, fontFamily: homeFont, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  body: { flex: 1 },
  portrait: { width: 48, height: 48, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceHighlight },
  portraitOpponent: { backgroundColor: colors.primaryMuted },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 70, padding: spacing.sm },
  statusError: { borderColor: colors.dangerShadow },
  statusCopy: { flex: 1, color: colors.ink, fontFamily: homeFont, fontSize: 16, lineHeight: 21, fontWeight: '800' },
});
