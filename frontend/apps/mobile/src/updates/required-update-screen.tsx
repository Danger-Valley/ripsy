import { useEffect, useState } from 'react';
import { BackHandler, Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UpdateRule } from '@rps/core/app-updates';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from '../components/toy-home-controls';
import { colors } from '../theme';
import type { InstalledApp } from './app-info';

const stores = { ios: 'App Store', android: 'Google Play', seeker: 'dApp Store' } as const;

export function RequiredUpdateScreen({ rule, app, refreshing, checkFailed, onCheck }: {
  rule: UpdateRule; app: InstalledApp; refreshing: boolean; checkFailed: boolean; onCheck: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);
  const openStore = async () => {
    if (opening || !rule.storeUrl) return;
    setOpening(true); setOpenFailed(false);
    try {
      try { await Linking.openURL(rule.storeUrl); }
      catch (failure) {
        if (!rule.fallbackUrl) throw failure;
        await Linking.openURL(rule.fallbackUrl);
      }
    } catch { setOpenFailed(true); }
    finally { setOpening(false); }
  };
  return (
    <View testID="required-update-screen" style={styles.screen} accessibilityViewIsModal>
      <Image source={require('../assets/ui/battle-playground.png')} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
        <Image source={homeArt.logo} style={styles.logo} resizeMode="contain" accessibilityLabel="RIPSY" />
        <ToyHomePanel style={styles.panel}>
          <View style={styles.portrait}><Image source={homeArt.army} style={styles.fighter} resizeMode="contain" accessible={false} /></View>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={styles.title}>{rule.title}</Text>
          <Text maxFontSizeMultiplier={1.6} style={styles.message}>{rule.message}</Text>
          {rule.latestVersion && <Text style={styles.version}>New version: {rule.latestVersion}</Text>}
          <ToyHomeButton tone="yellow" sound={false} busy={opening} onPress={openStore} accessibilityHint={`Opens ${stores[app.channel]} to update RIPSY`}>
            Update RIPSY
          </ToyHomeButton>
          <Text maxFontSizeMultiplier={1.6} style={styles.note}>Install the update, then return to your adventure.</Text>
          {(checkFailed || openFailed) && <Text accessibilityRole="alert" style={styles.error}>
            {openFailed ? 'Could not open the store. Check your connection and try again.' : 'Could not check for updates. Please try again when you are online.'}
          </Text>}
          {openFailed && <Text selectable style={styles.link}>{rule.fallbackUrl ?? rule.storeUrl}</Text>}
          <ToyHomeButton compact tone="white" sound={false} busy={refreshing} onPress={onCheck}>Check again</ToyHomeButton>
          <Text style={styles.build}>Installed: {app.version} ({app.build})</Text>
        </ToyHomePanel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  logo: { width: '80%', maxWidth: 320, height: 110 },
  panel: { width: '100%', maxWidth: 460, padding: 22, gap: 16 },
  portrait: { alignSelf: 'center', backgroundColor: '#C5F3FD', borderRadius: 36, padding: 12 },
  fighter: { width: 100, height: 110 },
  title: { fontFamily: homeFont, fontWeight: '900', fontSize: 30, color: colors.ink, textAlign: 'center' },
  message: { color: colors.ink, fontSize: 18, lineHeight: 26, textAlign: 'center' },
  version: { color: colors.ink, fontFamily: homeFont, fontSize: 16, textAlign: 'center' },
  note: { color: colors.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  error: { color: '#A12D32', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  link: { color: colors.ink, fontSize: 13, textAlign: 'center' },
  build: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
