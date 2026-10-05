import { useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from 'react-native';
import type { PushPermissionState } from '../push-notifications';
import { colors, spacing } from '../theme';
import { Choice } from '@rps/core';
import { weaponArt } from './battle-panels';
import { ToyBadge, ToyDialog, ToySectionHeading } from './toy-dialog';
import { homeArt, homeFont, ToyHomeButton } from './toy-home-controls';
import { SoundSettings } from './sound-settings';

const notificationCopy: Record<PushPermissionState, { title: string; copy: string }> = {
  checking: { title: 'Checking notifications…', copy: 'Finding out whether battle alerts are enabled.' },
  enabled: { title: 'Battle alerts are on', copy: 'We’ll notify you when your opponent moves.' },
  prompt: { title: 'Don’t miss your turn', copy: 'Enable notifications for online battles.' },
  denied: { title: 'Battle alerts are off', copy: 'Allow notifications in your device settings.' },
  unavailable: { title: 'Alerts unavailable', copy: 'Notifications are not available on this device or build. You can still play.' },
  error: { title: 'Couldn’t enable alerts', copy: 'Check your connection and try again.' },
};

export function SettingsDialog({ visible, status, ready, onClose, onEnable, onArmy, onShop }: { visible: boolean; status: PushPermissionState; ready: boolean; onClose: () => void; onEnable: () => void; onArmy: () => void; onShop: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const details = notificationCopy[status];
  return <ToyDialog visible={visible} title="Settings" icon={homeArt.settings} onClose={onClose} closeLabel="Close settings" testID="settings-dialog">
    <SoundSettings />
    <View style={styles.notification}>
      <ToyBadge tone={status === 'enabled' ? 'green' : status === 'error' || status === 'denied' ? 'coral' : 'blue'}>{status === 'enabled' ? 'ON' : status === 'checking' ? 'CHECKING' : status === 'unavailable' ? 'UNAVAILABLE' : 'OFF'}</ToyBadge>
      <Text style={styles.sectionTitle}>{details.title}</Text>
      <Text style={styles.copy}>{details.copy}</Text>
      {status === 'checking' && <ActivityIndicator accessibilityLabel="Checking notification permissions" color={colors.ink} />}
      {(status === 'prompt' || status === 'error') && <ToyHomeButton compact tone="yellow" disabled={!ready} onPress={onEnable}>{status === 'error' ? 'Retry notifications' : 'Enable notifications'}</ToyHomeButton>}
      {status === 'denied' && <ToyHomeButton compact tone="white" onPress={() => { setError(null); Linking.openSettings().catch(() => setError('Couldn’t open device settings. Open them from your home screen.')); }}>Open device settings</ToyHomeButton>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
    <ToySectionHeading title="Your playground" copy="Your fighters, your collection." />
    <View style={styles.menu}><ToyHomeButton stacked compact icon={homeArt.army} style={styles.grow} onPress={onArmy}>Your army</ToyHomeButton><ToyHomeButton stacked compact tone="yellow" icon={homeArt.shop} style={styles.grow} onPress={onShop}>Figure shop</ToyHomeButton></View>
    <Text style={styles.hint}>RIPSY · Build your army. Grab the flag!</Text>
  </ToyDialog>;
}

export function BattleGuideDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <ToyDialog visible={visible} title="How to battle" icon={homeArt.swords} onClose={onClose} closeLabel="Close battle guide" testID="battle-guide">
    <SoundSettings />
    <GuideStep number="1" title="Shuffle. Save. Go!" copy="Use the controls below the board to set your hidden lineup. Save within three minutes." />
    <GuideStep number="2" title="Choose your move" copy="Tap your fighter, then a highlighted cell. Move one cell up, down, left or right." />
    <View style={styles.weaponRules}>
      {([{ choice: Choice.Rock, label: 'Rock', beats: 'Scissors' }, { choice: Choice.Scissors, label: 'Scissors', beats: 'Paper' }, { choice: Choice.Paper, label: 'Paper', beats: 'Rock' }] as const).map(rule => <View key={rule.choice} style={styles.weaponRule}><Image accessibilityElementsHidden source={weaponArt[rule.choice]} style={styles.weaponImage} /><Text style={styles.ruleLabel}>{rule.label}</Text><Text style={styles.ruleCopy}>beats {rule.beats}</Text></View>)}
    </View>
    <GuideStep number="3" title="Steal the flag" copy="Capture the opponent’s flag to win. Flags move only onto empty cells; traps stay put and defeat attackers." />
    <GuideStep number="4" title="Watch your clock" copy="Ten minutes for all your moves. Your time runs while you think. At zero, you lose." />
    <Text style={styles.hint}>Same weapons? Both players pick again.</Text>
    <ToyHomeButton tone="yellow" onPress={onClose}>Back to battle</ToyHomeButton>
  </ToyDialog>;
}

function GuideStep({ number, title, copy }: { number: string; title: string; copy: string }) {
  return <View style={styles.step}><View accessibilityElementsHidden style={styles.stepNumber}><Text style={styles.number}>{number}</Text></View><View style={styles.grow}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.copy}>{copy}</Text></View></View>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  notification: { backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: 18, gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 20 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  menu: { flexDirection: 'row', gap: spacing.md },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.dangerShadow, fontSize: 13, lineHeight: 19 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNumber: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.rewardHighlight, alignItems: 'center', justifyContent: 'center' },
  number: { color: colors.ink, fontFamily: homeFont, fontSize: 18 },
  stepTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 18, marginBottom: spacing.xs },
  weaponRules: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.kitPanelSoft, borderRadius: 16, padding: spacing.sm },
  weaponRule: { flex: 1, alignItems: 'center', gap: spacing.xs },
  weaponImage: { width: 48, height: 48, resizeMode: 'contain' },
  ruleLabel: { color: colors.ink, fontFamily: homeFont, fontSize: 14 },
  ruleCopy: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
