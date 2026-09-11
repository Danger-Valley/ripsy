import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, ScrollView, Share, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Choice, HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard, type LineupPiece } from '../components/game-board';
import { PrimaryButton } from '../components/primary-button';
import { StatusBanner } from '../components/status-banner';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { useGameAnimationQueue } from '../hooks/use-game-animation-queue';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { haptics } from '../haptics';
import { createGameInviteUrl, normalizeRoomCode } from '../invitations';
import type { RootStackParamList } from '../navigation';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;
type Coordinate = { x: number; y: number };
type WeaponChoice = typeof Choice.Rock | typeof Choice.Paper | typeof Choice.Scissors;

const weaponImages = {
  [Choice.Rock]: require('../assets/weapons/rock.png'),
  [Choice.Paper]: require('../assets/weapons/paper.png'),
  [Choice.Scissors]: require('../assets/weapons/scissors.png'),
} satisfies Record<WeaponChoice, ImageSourcePropType>;

export function GameScreen({ navigation, route }: Props) {
  const gameId = normalizeRoomCode(route.params.gameId) ?? '';
  const { playerId, sessionToken } = usePlayerIdentity();
  const game = useNativeRipsyGame(playerId, sessionToken, gameId);
  const animation = useGameAnimationQueue(game.gameState);
  const visibleState = animation.displayedState ?? game.gameState;
  const [lineup, setLineup] = useState<LineupPiece[]>([]);
  const [selected, setSelected] = useState<Coordinate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const previousPhase = useRef<Phase | undefined>(undefined);
  const previousTiePending = useRef(false);

  const isParticipant = game.isPlayer0 || game.isPlayer1;
  const hasSubmitted = Boolean(game.gameState && (
    game.isPlayer0
      ? game.gameState.phase === Phase.LineupP0Set || game.gameState.phase >= Phase.Active
      : game.gameState.phase === Phase.LineupP1Set || game.gameState.phase >= Phase.Active
  ));
  const canEditLineup = Boolean(isParticipant && game.gameState && game.gameState.phase < Phase.Active);
  const isWaitingForOpponent = Boolean(game.isPlayer0 && game.gameState && !game.gameState.p1 && game.gameState.phase < Phase.Active);

  useEffect(() => {
    if (!canEditLineup || lineup.length > 0 || !game.gameState) return;
    const savedLineup = lineupFromState(game.gameState, game.ownOwner);
    setLineup(savedLineup.length > 0 ? savedLineup : createRandomLineup(game.isPlayer0));
  }, [canEditLineup, game.gameState, game.isPlayer0, game.ownOwner, lineup.length]);

  useEffect(() => {
    if (!game.gameState?.tiePending) setSelected(null);
  }, [game.gameState?.tiePending]);

  useEffect(() => {
    const state = game.gameState;
    if (!state) return;
    if (previousPhase.current !== undefined && previousPhase.current !== Phase.Finished && state.phase === Phase.Finished) {
      haptics.success();
    } else if (!previousTiePending.current && state.tiePending) {
      haptics.warning();
    }
    previousPhase.current = state.phase;
    previousTiePending.current = state.tiePending;
  }, [game.gameState]);

  const availableMoves = useMemo(() => {
    if (!selected || animation.isAnimating || !game.isMyTurn || visibleState?.phase !== Phase.Active) return [];
    return [
      { x: selected.x + 1, y: selected.y },
      { x: selected.x - 1, y: selected.y },
      { x: selected.x, y: selected.y + 1 },
      { x: selected.x, y: selected.y - 1 },
    ].filter(position => position.x >= 0 && position.x < WIDTH && position.y >= 0 && position.y < HEIGHT);
  }, [animation.isAnimating, game.isMyTurn, selected, visibleState?.phase]);

  const perform = async (operation: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await operation();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Action failed');
    }
  };

  const submitLineup = () => perform(() => saveLineup(game.submitLineup, lineup));

  const shareRoom = () => perform(async () => {
    const inviteUrl = createGameInviteUrl(gameId);
    await Share.share(Platform.OS === 'ios'
      ? { title: 'Join my RIPSY game', message: 'Join my RIPSY game', url: inviteUrl }
      : { title: 'Join my RIPSY game', message: `Join my RIPSY game: ${inviteUrl}` });
  });

  const onCellPress = (coordinate: Coordinate) => {
    if (canEditLineup) {
      const selectedIndex = selected && lineup.findIndex(item => item.x === selected.x && item.y === selected.y);
      const targetIndex = lineup.findIndex(item => item.x === coordinate.x && item.y === coordinate.y);
      if (targetIndex < 0) return;
      if (selectedIndex === null || selectedIndex === undefined || selectedIndex < 0) {
        setSelected(coordinate);
        return;
      }
      if (selectedIndex === targetIndex) {
        setSelected(null);
        return;
      }
      setLineup(current => {
        const next = current.map(item => ({ ...item }));
        const selectedPiece = next[selectedIndex]!.piece;
        next[selectedIndex]!.piece = next[targetIndex]!.piece;
        next[targetIndex]!.piece = selectedPiece;
        return next;
      });
      setSelected(null);
      return;
    }
    const state = visibleState;
    if (!state || animation.isAnimating || state.phase !== Phase.Active || !game.isMyTurn || state.tiePending) return;
    const owner = state.owners[toIdx(coordinate.x, coordinate.y)];
    if (!selected) {
      if (owner === game.ownOwner) setSelected(coordinate);
      return;
    }
    if (owner === game.ownOwner) {
      setSelected(selected.x === coordinate.x && selected.y === coordinate.y ? null : coordinate);
      return;
    }
    if (!availableMoves.some(move => move.x === coordinate.x && move.y === coordinate.y)) return;
    const from = selected;
    setSelected(null);
    perform(() => game.movePiece(from.x, from.y, coordinate.x, coordinate.y)).catch(() => undefined);
  };

  const stateMessage = animation.activeKind
    ? getAnimationMessage(animation.activeKind)
    : getStateMessage(visibleState?.phase, isParticipant, canEditLineup, hasSubmitted, game.isMyTurn);

  if (!gameId) {
    return (
      <View style={styles.invalidRoom}>
        <StatusBanner message="This invitation contains an invalid room code" tone="error" />
        <PrimaryButton onPress={() => navigation.replace('Home')}>Back to home</PrimaryButton>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {isWaitingForOpponent ? (
          <View style={styles.waitingCard}>
            <View accessibilityLabel="Waiting for opponent. Your lineup stays editable until the battle begins." accessible style={styles.waitingHeader}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.waitingIndicator}>
                <View style={styles.waitingDot} />
              </View>
              <View style={styles.waitingCopy}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.waitingTitle}>Waiting for opponent</Text>
                <Text maxFontSizeMultiplier={2} style={styles.waitingDescription}>Your lineup stays editable until the battle begins.</Text>
              </View>
            </View>
            <PrimaryButton accessibilityHint="Opens the system share sheet" variant="secondary" onPress={() => { shareRoom().catch(() => undefined); }}>Invite opponent</PrimaryButton>
          </View>
        ) : (
          <StatusBanner message={stateMessage} tone={visibleState?.phase === Phase.Finished ? 'success' : 'neutral'} />
        )}
        {(actionError || game.error) && <StatusBanner message={actionError || game.error || ''} tone="error" />}

        <Animated.View style={{ opacity: animation.opacity, transform: [{ scale: animation.scale }] }}>
          <GameBoard
            availableMoves={availableMoves}
            interactionEnabled={Boolean(canEditLineup || (!animation.isAnimating && game.isMyTurn && visibleState?.phase === Phase.Active && !visibleState.tiePending))}
            isPlayer1={game.isPlayer1}
            lineupEditing={canEditLineup}
            onCellPress={onCellPress}
            ownOwner={game.ownOwner}
            previewLineup={canEditLineup ? lineup : undefined}
            selected={selected}
            state={visibleState}
          />
        </Animated.View>

        {(game.gameState?.phase === Phase.Created || game.gameState?.phase === Phase.LineupP0Set) && !isParticipant && (
          <PrimaryButton onPress={() => { perform(game.joinGame).catch(() => undefined); }} busy={game.isBusy}>Join this game</PrimaryButton>
        )}
        {canEditLineup && (
          <View style={styles.lineupPanel} testID="lineup-controls">
            <View style={styles.lineupHeader}>
              <View style={styles.lineupCopy}>
                <Text maxFontSizeMultiplier={2} style={styles.lineupEyebrow}>YOUR LINEUP</Text>
                <Text maxFontSizeMultiplier={2} style={styles.lineupDescription}>
                  {hasSubmitted ? 'Saved — you can keep editing it.' : 'Shuffle or tap pieces to rearrange.'}
                </Text>
              </View>
              {hasSubmitted && (
                <View accessibilityLabel="Lineup saved" style={styles.savedBadge}>
                  <View style={styles.savedDot} />
                  <Text maxFontSizeMultiplier={1.6} style={styles.savedText}>SAVED</Text>
                </View>
              )}
            </View>
            <View style={styles.lineupActions}>
              <View style={styles.lineupAction}>
                <PrimaryButton accessibilityHint="Creates a different random hidden lineup" variant="secondary" onPress={() => {
                  setSelected(null);
                  setLineup(createRandomLineup(game.isPlayer0));
                }}>Shuffle</PrimaryButton>
              </View>
              <View style={styles.lineupAction}>
                <PrimaryButton accessibilityHint="Saves your current hidden lineup" onPress={() => { submitLineup().catch(() => undefined); }} busy={game.isBusy}>
                  {hasSubmitted ? 'Save changes' : 'Save lineup'}
                </PrimaryButton>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <WeaponChoiceModal
        busy={game.isBusy}
        isOpen={Boolean(!animation.isAnimating && visibleState?.tiePending && visibleState.playerChoice === Choice.None && isParticipant)}
        onChoose={choice => { perform(() => game.chooseWeapon(choice)).catch(() => undefined); }}
      />
    </View>
  );
}

function getAnimationMessage(kind: 'move' | 'battle' | 'phase') {
  if (kind === 'battle') return 'Resolving battle…';
  if (kind === 'move') return 'Moving piece…';
  return 'Updating game…';
}

function WeaponChoiceModal({ isOpen, busy, onChoose }: { isOpen: boolean; busy: boolean; onChoose: (choice: Choice) => void }) {
  return (
    <Modal animationType="fade" onRequestClose={() => undefined} transparent visible={isOpen}>
      <View accessibilityViewIsModal style={styles.modalBackdrop}>
        <ScrollView bounces={false} contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.modalTitle}>Break the tie</Text>
            <Text maxFontSizeMultiplier={2} style={styles.modalCopy}>Both pieces matched. Choose a new weapon.</Text>
            <WeaponButton choice={Choice.Rock} label="Rock" busy={busy} onChoose={onChoose} />
            <WeaponButton choice={Choice.Paper} label="Paper" busy={busy} onChoose={onChoose} />
            <WeaponButton choice={Choice.Scissors} label="Scissors" busy={busy} onChoose={onChoose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function WeaponButton({ choice, label, busy, onChoose }: { choice: WeaponChoice; label: string; busy: boolean; onChoose: (choice: Choice) => void }) {
  const source = weaponImages[choice];
  return (
    <View style={styles.weaponChoice}>
      {source && <Image accessibilityIgnoresInvertColors source={source} style={styles.weaponImage} />}
      <View style={styles.weaponButton}>
        <PrimaryButton accessibilityLabel={`Choose ${label.toLowerCase()}`} onPress={() => onChoose(choice)} disabled={busy}>{label}</PrimaryButton>
      </View>
    </View>
  );
}

function getStateMessage(phase: Phase | undefined, isParticipant: boolean, canEditLineup: boolean, hasSubmitted: boolean, isMyTurn: boolean) {
  if (phase === undefined) return 'Loading the latest game state…';
  if (!isParticipant && (phase === Phase.Created || phase === Phase.LineupP0Set)) return 'This room has an open player slot';
  if (canEditLineup) {
    if (hasSubmitted) return 'Lineup saved. You can change it until the battle starts';
    return 'Shuffle and save your hidden lineup';
  }
  if (phase === Phase.Created) return isParticipant ? 'Waiting for an opponent to join' : 'This room has an open player slot';
  if (phase === Phase.Active) return isMyTurn ? 'Your turn — select a piece' : "Opponent's turn";
  if (phase === Phase.Finished) return 'Game finished';
  return 'Preparing game…';
}

function saveLineup(
  submit: (xs: number[], ys: number[], pieces: number[]) => Promise<unknown>,
  lineup: LineupPiece[],
) {
  return submit(
    lineup.map(item => item.x),
    lineup.map(item => item.y),
    lineup.map(item => item.piece),
  );
}

function lineupFromState(state: GameState, owner: Owner): LineupPiece[] {
  const lineup: LineupPiece[] = [];
  for (let index = 0; index < state.owners.length; index += 1) {
    if (state.owners[index] !== owner || state.pieces[index] === Piece.Empty) continue;
    lineup.push({ x: index % WIDTH, y: Math.floor(index / WIDTH), piece: state.pieces[index]! });
  }
  return lineup;
}

function createRandomLineup(isPlayer0: boolean): LineupPiece[] {
  const pieces: Piece[] = [
    Piece.Rock, Piece.Rock, Piece.Rock, Piece.Rock,
    Piece.Paper, Piece.Paper, Piece.Paper, Piece.Paper,
    Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Scissors,
    Piece.Flag, Piece.Trap,
  ];
  const cells = Array.from({ length: WIDTH * 2 }, (_, index) => ({
    x: index % WIDTH,
    y: isPlayer0 ? HEIGHT - 2 + Math.floor(index / WIDTH) : Math.floor(index / WIDTH),
  }));
  shuffle(pieces);
  shuffle(cells);
  return pieces.map((piece, index) => ({ ...cells[index]!, piece }));
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [items[index], items[target]] = [items[target]!, items[index]!];
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  invalidRoom: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  waitingCard: { backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: 16, padding: spacing.lg, gap: spacing.lg },
  waitingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waitingIndicator: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceStrong, borderColor: colors.primaryMuted, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waitingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  waitingCopy: { flex: 1, gap: spacing.xs },
  waitingTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  waitingDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  lineupPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.lg, gap: spacing.lg },
  lineupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  lineupCopy: { flex: 1, gap: spacing.xs },
  lineupEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  lineupDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  lineupActions: { flexDirection: 'row', gap: spacing.sm },
  lineupAction: { flex: 1 },
  savedBadge: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: 999, backgroundColor: colors.surfaceStrong, paddingHorizontal: spacing.sm },
  savedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  savedText: { color: colors.success, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 2, borderRadius: 18, padding: spacing.xl, gap: spacing.md },
  modalTitle: { color: colors.primary, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  modalCopy: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: spacing.sm },
  weaponChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weaponImage: { width: 48, height: 48, resizeMode: 'contain' },
  weaponButton: { flex: 1 },
});
