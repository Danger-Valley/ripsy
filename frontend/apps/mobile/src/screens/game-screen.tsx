import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, ScrollView, Share, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Choice, HEIGHT, Phase, Piece, toIdx, WIDTH } from '@rps/core';
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
  const needsLineup = Boolean(isParticipant && game.gameState && game.gameState.phase >= Phase.Joined && game.gameState.phase < Phase.Active && !hasSubmitted);

  useEffect(() => {
    if (needsLineup && lineup.length === 0) setLineup(createRandomLineup(game.isPlayer0));
  }, [game.isPlayer0, lineup.length, needsLineup]);

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

  const submitLineup = () => perform(() => game.submitLineup(
    lineup.map(item => item.x),
    lineup.map(item => item.y),
    lineup.map(item => item.piece),
  ));

  const shareRoom = () => perform(async () => {
    const inviteUrl = createGameInviteUrl(gameId);
    await Share.share(Platform.OS === 'ios'
      ? { title: 'Join my RIPSY game', message: 'Join my RIPSY game', url: inviteUrl }
      : { title: 'Join my RIPSY game', message: `Join my RIPSY game: ${inviteUrl}` });
  });

  const onCellPress = (coordinate: Coordinate) => {
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
    : getStateMessage(visibleState?.phase, isParticipant, needsLineup, hasSubmitted, game.isMyTurn);

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
        <View style={styles.header}>
          <View>
            <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>ROOM</Text>
            <Text accessibilityLabel={`Room code ${gameId}`} accessibilityRole="header" maxFontSizeMultiplier={1.8} style={styles.room}>{gameId}</Text>
          </View>
          <Text
            accessibilityLabel={game.isConnected ? 'Game server connected' : `Game server ${game.status}`}
            maxFontSizeMultiplier={1.8}
            style={[styles.connection, game.isConnected && styles.connected]}>
            {game.isConnected ? 'LIVE' : game.status.toUpperCase()}
          </Text>
        </View>

        <StatusBanner message={stateMessage} tone={visibleState?.phase === Phase.Finished ? 'success' : 'neutral'} />
        {(actionError || game.error) && <StatusBanner message={actionError || game.error || ''} tone="error" />}

        <Animated.View style={{ opacity: animation.opacity, transform: [{ scale: animation.scale }] }}>
          <GameBoard
            availableMoves={availableMoves}
            interactionEnabled={Boolean(!animation.isAnimating && game.isMyTurn && visibleState?.phase === Phase.Active && !visibleState.tiePending)}
            isPlayer1={game.isPlayer1}
            onCellPress={onCellPress}
            ownOwner={game.ownOwner}
            previewLineup={needsLineup ? lineup : undefined}
            selected={selected}
            state={visibleState}
          />
        </Animated.View>

        {game.gameState?.phase === Phase.Created && game.isPlayer0 && (
          <PrimaryButton accessibilityHint="Opens the system share sheet" variant="secondary" onPress={() => { shareRoom().catch(() => undefined); }}>Share invite link</PrimaryButton>
        )}
        {game.gameState?.phase === Phase.Created && !isParticipant && (
          <PrimaryButton onPress={() => { perform(game.joinGame).catch(() => undefined); }} busy={game.isBusy}>Join this game</PrimaryButton>
        )}
        {needsLineup && (
          <View style={styles.actions}>
            <PrimaryButton accessibilityHint="Creates a different random hidden lineup" variant="secondary" onPress={() => setLineup(createRandomLineup(game.isPlayer0))}>Shuffle lineup</PrimaryButton>
            <PrimaryButton accessibilityHint="Locks in your current hidden lineup" onPress={() => { submitLineup().catch(() => undefined); }} busy={game.isBusy}>Submit lineup</PrimaryButton>
          </View>
        )}

        {game.gameState && isParticipant && (
          <View style={styles.stats}>
            <Stat label="Your pieces" value={String(game.isPlayer0 ? visibleState?.live0 ?? game.gameState.live0 : visibleState?.live1 ?? game.gameState.live1)} />
            <Stat label="Opponent" value={String(game.isPlayer0 ? visibleState?.live1 ?? game.gameState.live1 : visibleState?.live0 ?? game.gameState.live0)} />
            <Stat label="Side" value={game.isPlayer0 ? 'Player 1' : 'Player 2'} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} accessible style={styles.stat}>
      <Text maxFontSizeMultiplier={2} style={styles.statValue}>{value}</Text>
      <Text maxFontSizeMultiplier={2} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function getStateMessage(phase: Phase | undefined, isParticipant: boolean, needsLineup: boolean, hasSubmitted: boolean, isMyTurn: boolean) {
  if (phase === undefined) return 'Loading the latest game state…';
  if (phase === Phase.Created) return isParticipant ? 'Waiting for an opponent to join' : 'This room has an open player slot';
  if (needsLineup) return 'Shuffle and submit your hidden lineup';
  if (phase < Phase.Active && hasSubmitted) return 'Lineup submitted. Waiting for your opponent';
  if (phase === Phase.Active) return isMyTurn ? 'Your turn — select a piece' : "Opponent's turn";
  if (phase === Phase.Finished) return 'Game finished';
  return 'Preparing game…';
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
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  eyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  room: { color: colors.primary, fontSize: 24, fontWeight: '900', letterSpacing: 3 },
  connection: { color: colors.warning, borderColor: colors.warning, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  connected: { color: colors.success, borderColor: colors.success },
  actions: { gap: spacing.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexGrow: 1, flexBasis: 120, backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 2, borderRadius: 18, padding: spacing.xl, gap: spacing.md },
  modalTitle: { color: colors.primary, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  modalCopy: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: spacing.sm },
  weaponChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weaponImage: { width: 48, height: 48, resizeMode: 'contain' },
  weaponButton: { flex: 1 },
});
