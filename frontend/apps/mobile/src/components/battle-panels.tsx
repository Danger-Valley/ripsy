import { ActivityIndicator, Animated, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Choice, type GameState } from '@rps/core';
import { LineupCountdown } from './lineup-countdown';
import { ToyBadge, ToyDialog, ToySectionHeading } from './toy-dialog';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from './toy-home-controls';
import { colors, spacing } from '../theme';
import { InviteQr } from './invite-qr';

type WeaponChoice = typeof Choice.Rock | typeof Choice.Paper | typeof Choice.Scissors;
export const weaponArt = {
  [Choice.Rock]: require('../assets/weapons/rock.png'),
  [Choice.Paper]: require('../assets/weapons/paper.png'),
  [Choice.Scissors]: require('../assets/weapons/scissors.png'),
};

export function WeaponChoiceModal({ isOpen, busy, onChoose }: { isOpen: boolean; busy: boolean; onChoose: (choice: Choice) => void }) {
  return <ToyDialog visible={isOpen} title="Break the tie!" icon={homeArt.swords} testID="weapon-choice-modal">
    <ToyBadge tone="yellow">SAME WEAPON · CHOOSE AGAIN</ToyBadge>
    <Text style={styles.copy}>Pick a new weapon. Both fighters reveal together.</Text>
    <View style={styles.weaponGrid}>
      {([{ choice: Choice.Rock, label: 'Rock' }, { choice: Choice.Paper, label: 'Paper' }, { choice: Choice.Scissors, label: 'Scissors' }] as const).map(({ choice, label }) => <ToyHomeButton key={choice} stacked icon={weaponArt[choice as WeaponChoice]} tone="yellow" style={styles.weapon} accessibilityLabel={`Choose ${label.toLowerCase()}`} accessibilityHint="Submits this weapon for the tied battle" busy={false} disabled={busy} onPress={() => onChoose(choice)}>{label}</ToyHomeButton>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.hint}>{busy ? 'Saving your choice…' : 'Rock beats scissors. Scissors beat paper. Paper beats rock.'}</Text>
  </ToyDialog>;
}

export function BattleResultPanel({ outcome, reason, onBack }: { outcome: 'victory' | 'defeat' | 'cancelled'; reason?: GameState['finishReason']; onBack: () => void }) {
  const title = outcome === 'victory' ? 'Victory!' : outcome === 'defeat' ? 'Good fight!' : 'Battle canceled';
  const copy = outcome === 'victory'
    ? reason === 'timeout' ? 'Your opponent ran out of time. This round is yours.' : 'You captured the flag. Your army takes the win!'
    : outcome === 'defeat'
      ? reason === 'timeout' ? 'Your clock hit zero. Try a faster plan next round.' : 'Your opponent captured the flag. A new lineup, a new chance.'
      : 'A lineup was not saved in time. No winner this round.';
  return <ToyHomePanel style={styles.panel}>
    <View testID="battle-result-card" accessibilityLiveRegion="polite" style={styles.result}>
      <View style={[styles.resultBanner, outcome === 'defeat' && styles.coralBanner, outcome === 'cancelled' && styles.neutralBanner]}>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.resultSymbol}>{outcome === 'victory' ? '★' : outcome === 'defeat' ? '↺' : '—'}</Text>
        <View style={styles.grow}><Text style={styles.eyebrow}>{outcome === 'cancelled' ? 'NO CONTEST' : 'ROUND COMPLETE'}</Text><Text accessibilityRole="header" style={styles.resultTitle}>{title}</Text></View>
      </View>
      <Text style={styles.copy}>{copy}</Text>
      <ToyHomeButton tone={outcome === 'victory' ? 'yellow' : 'blue'} icon={homeArt.swords} onPress={onBack}>Back to playground</ToyHomeButton>
      <Text style={styles.hint}>Your figures are ready for another round.</Text>
    </View>
  </ToyHomePanel>;
}

export function WaitingPanel({ gameId, onInvite }: { gameId: string; onInvite: () => void }) {
  return <ToyHomePanel style={styles.panel}>
    <View accessible accessibilityLabel="Waiting for opponent. The board is a preview. Use the controls below it to set your lineup."><ToySectionHeading icon={homeArt.players} title="Waiting for opponent" copy="Set your lineup while your friend joins." /></View>
    <InviteQr gameId={gameId} />
    <ToyHomeButton compact tone="blue" accessibilityHint="Opens the system share sheet" onPress={onInvite}>Invite opponent</ToyHomeButton>
    <Text style={styles.hint}>The board is a preview. Use Shuffle and Save below.</Text>
  </ToyHomePanel>;
}

export function LineupPanel({ saved, hasSubmitted, busy, deadlineAt, attention, onShuffle, onSave }: {
  saved: boolean; hasSubmitted: boolean; busy: boolean; deadlineAt?: number | null;
  attention: Animated.Value; onShuffle: () => void; onSave: () => void;
}) {
  return <ToyHomePanel style={styles.panel}>
    <View testID="lineup-controls" style={styles.lineup}>
      {!saved && <Animated.View testID="lineup-attention-glow" pointerEvents="none" style={[styles.lineupGlow, { opacity: attention.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.8] }), transform: [{ scale: attention.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }) }] }]} />}
      <ToySectionHeading title={saved ? 'Army ready!' : 'Set your lineup'} icon={homeArt.army} />
      <View style={styles.lineupState}>
        <ToyBadge accessibilityLabel={saved ? 'Lineup saved' : undefined} tone={saved ? 'green' : 'yellow'}>{saved ? 'READY' : hasSubmitted ? 'UNSAVED CHANGES' : 'SHUFFLE → SAVE → PLAY'}</ToyBadge>
        {!saved && deadlineAt && <LineupCountdown deadlineAt={deadlineAt} />}
      </View>
      <Text style={styles.copy}>{saved ? 'Saved! Battle starts when your opponent is ready. You can still shuffle before it begins.' : hasSubmitted ? 'New arrangement? Save your changes to use it.' : 'The board is a preview, not an editor. Shuffle until it feels right, then save below.'}</Text>
      <View style={styles.lineupActions}>
        <ToyHomeButton compact tone="blue" style={styles.grow} disabled={busy} accessibilityHint="Creates a different random hidden lineup" onPress={onShuffle}>Shuffle</ToyHomeButton>
        <ToyHomeButton compact tone={saved ? 'green' : 'yellow'} style={styles.grow} disabled={saved} busy={busy} accessibilityHint="Saves your current hidden lineup" onPress={onSave}>{saved ? 'Lineup saved' : hasSubmitted ? 'Save changes' : 'Save lineup'}</ToyHomeButton>
      </View>
    </View>
  </ToyHomePanel>;
}

export function JoinGate({ gameId, mode, serverError, onBack, onRetry }: { gameId: string; mode: 'loading' | 'joining' | 'failed' | 'unavailable'; serverError?: string | null; onBack: () => void; onRetry?: () => void }) {
  const working = mode === 'loading' || mode === 'joining';
  const title = mode === 'loading' ? 'Opening battle…' : mode === 'joining' ? 'Joining battle…' : mode === 'failed' ? 'Couldn’t join battle' : 'Battle unavailable';
  const copy = mode === 'loading' ? 'Checking the room and your place at the table.' : mode === 'joining' ? 'Taking your place. Your lineup is next!' : mode === 'failed' ? serverError || 'Check your connection and try again.' : 'This room is full or the battle is no longer joinable.';
  return <ScrollView contentContainerStyle={styles.joinScroll}>
    <ToyHomePanel style={[styles.panel, styles.joinCard]}>
      <Image accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={homeArt.players} style={styles.joinArt} />
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.joinTitle}>{title}</Text>
      <Text style={[styles.copy, styles.center]}>{copy}</Text>
      <View style={styles.roomCode}><Text selectable style={styles.code}>{gameId}</Text></View>
      {working ? <View accessibilityLabel={title} accessibilityRole="progressbar" style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.hint}>No extra join step. We’ll open lineup setup.</Text></View> : <>
        {onRetry && <ToyHomeButton tone="yellow" onPress={onRetry}>Try again</ToyHomeButton>}
        <ToyHomeButton tone="white" onPress={onBack}>Back to home</ToyHomeButton>
      </>}
    </ToyHomePanel>
  </ScrollView>;
}

const styles = StyleSheet.create({
  panel: { padding: spacing.lg, gap: spacing.md },
  grow: { flex: 1 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  weaponGrid: { flexDirection: 'row', gap: spacing.sm },
  weapon: { flex: 1, minWidth: 0 },
  result: { gap: spacing.md },
  resultBanner: { backgroundColor: colors.rewardHighlight, borderRadius: 18, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  coralBanner: { backgroundColor: colors.primaryMuted },
  neutralBanner: { backgroundColor: colors.kitPanelSoft },
  resultSymbol: { color: colors.ink, fontSize: 48 },
  eyebrow: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  resultTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 30 },
  lineup: { position: 'relative', gap: spacing.md },
  lineupState: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  lineupActions: { flexDirection: 'row', gap: spacing.sm },
  lineupGlow: { position: 'absolute', top: -18, right: -18, bottom: -18, left: -18, borderColor: colors.rewardShadow, borderWidth: 2, borderRadius: 22 },
  joinScroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  joinCard: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: spacing.lg },
  joinArt: { width: 104, height: 104, alignSelf: 'center', resizeMode: 'contain' },
  joinTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 27, textAlign: 'center' },
  center: { textAlign: 'center' },
  roomCode: { backgroundColor: colors.surfaceHighlight, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 12 },
  code: { color: colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  loading: { gap: spacing.sm },
});
