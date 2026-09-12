import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, Share, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Choice, HEIGHT, isMovablePiece, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard, type LineupPiece } from '../components/game-board';
import { GameClocks } from '../components/game-clocks';
import { PrimaryButton } from '../components/primary-button';
import { StatusBanner } from '../components/status-banner';
import { useLocalComputerGame } from '../hooks/use-local-computer-game';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { useGameAnimationQueue } from '../hooks/use-game-animation-queue';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { isCompletedMoveTransition } from '../game-animation';
import { haptics } from '../haptics';
import { createGameInviteUrl, normalizeRoomCode } from '../invitations';
import { LOCAL_PLAYER_ID } from '../local-computer-game';
import type { RootStackParamList } from '../navigation';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;
type ComputerProps = NativeStackScreenProps<RootStackParamList, 'ComputerGame'>;
type Coordinate = { x: number; y: number };
type WeaponChoice = typeof Choice.Rock | typeof Choice.Paper | typeof Choice.Scissors;
type JoinStatus = 'idle' | 'joining' | 'joined' | 'failed';

const weaponImages = {
  [Choice.Rock]: require('../assets/weapons/rock.png'),
  [Choice.Paper]: require('../assets/weapons/paper.png'),
  [Choice.Scissors]: require('../assets/weapons/scissors.png'),
} satisfies Record<WeaponChoice, ImageSourcePropType>;

export function GameScreen({ navigation, route }: Props) {
  const gameId = normalizeRoomCode(route.params.gameId) ?? '';
  const { playerId, sessionToken } = usePlayerIdentity();
  const game = useNativeRipsyGame(playerId, sessionToken, gameId);

  return <BattleScreen game={game} gameId={gameId} isComputer={false} navigation={navigation} playerId={playerId} />;
}

export function ComputerGameScreen({ navigation }: ComputerProps) {
  const game = useLocalComputerGame();
  return <BattleScreen game={game} gameId="computer" isComputer navigation={navigation} playerId={LOCAL_PLAYER_ID} />;
}

function BattleScreen({ game, gameId, isComputer, navigation, playerId }: {
  game: ReturnType<typeof useNativeRipsyGame> | ReturnType<typeof useLocalComputerGame>;
  gameId: string;
  isComputer: boolean;
  navigation: Props['navigation'] | ComputerProps['navigation'];
  playerId: string;
}) {
  const { joinGame } = game;
  const animation = useGameAnimationQueue(game.gameState);
  const visibleState = animation.displayedState ?? game.gameState;
  const [lineup, setLineup] = useState<LineupPiece[]>([]);
  const [isLineupDirty, setIsLineupDirty] = useState(false);
  const [selected, setSelected] = useState<Coordinate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const previousPhase = useRef<Phase | undefined>(undefined);
  const previousTiePending = useRef(false);
  const previousMoveState = useRef<GameState | null>(null);

  const isParticipant = game.isPlayer0 || game.isPlayer1;
  const hasSubmitted = Boolean(game.gameState && (
    game.isPlayer0
      ? game.gameState.phase === Phase.LineupP0Set || game.gameState.phase >= Phase.Active
      : game.gameState.phase === Phase.LineupP1Set || game.gameState.phase >= Phase.Active
  ));
  const isLineupSaved = hasSubmitted && !isLineupDirty;
  const canEditLineup = Boolean(isParticipant && game.gameState && game.gameState.phase < Phase.Active);
  const isWaitingForOpponent = Boolean(!isComputer && game.isPlayer0 && game.gameState && !game.gameState.p1 && game.gameState.phase < Phase.Active);
  const hasOpenPlayerSlot = Boolean(
    game.gameState
    && !isParticipant
    && !game.gameState.p1
    && (game.gameState.phase === Phase.Created || game.gameState.phase === Phase.LineupP0Set),
  );

  useEffect(() => {
    setJoinStatus('idle');
    setJoinError(null);
  }, [gameId]);

  useEffect(() => {
    if (!hasOpenPlayerSlot || joinStatus !== 'idle') return;
    setJoinStatus('joining');
    setJoinError(null);
    joinGame()
      .then(() => setJoinStatus('joined'))
      .catch(cause => {
        setJoinStatus('failed');
        setJoinError(cause instanceof Error ? cause.message : 'Could not join this battle');
      });
  }, [hasOpenPlayerSlot, joinGame, joinStatus]);

  useEffect(() => {
    if (!canEditLineup || lineup.length > 0 || !game.gameState) return;
    const savedLineup = lineupFromState(game.gameState, game.ownOwner);
    if (savedLineup.length > 0) {
      setLineup(savedLineup);
      setIsLineupDirty(false);
    } else {
      setLineup(createRandomLineup(game.isPlayer0));
      setIsLineupDirty(true);
    }
  }, [canEditLineup, game.gameState, game.isPlayer0, game.ownOwner, lineup.length]);

  useEffect(() => {
    if (!game.gameState?.tiePending) setSelected(null);
  }, [game.gameState?.tiePending]);

  useEffect(() => {
    const state = game.gameState;
    if (!state) return;
    if (previousMoveState.current && isCompletedMoveTransition(previousMoveState.current, state)) {
      haptics.move();
    }
    if (previousPhase.current !== undefined && previousPhase.current !== Phase.Finished && state.phase === Phase.Finished) {
      haptics.success();
    } else if (!previousTiePending.current && state.tiePending) {
      haptics.warning();
    }
    previousPhase.current = state.phase;
    previousTiePending.current = state.tiePending;
    previousMoveState.current = state;
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
      return true;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Action failed');
      return false;
    }
  };

  const submitLineup = async () => {
    const didSave = await perform(() => saveLineup(game.submitLineup, lineup));
    if (!didSave) return;
    setIsLineupDirty(false);
    haptics.success();
  };

  const shareRoom = () => perform(async () => {
    const inviteUrl = createGameInviteUrl(gameId);
    await Share.share(Platform.OS === 'ios'
      ? { title: 'Join my RIPSY game', message: 'Join my RIPSY game', url: inviteUrl }
      : { title: 'Join my RIPSY game', message: `Join my RIPSY game: ${inviteUrl}` });
  });

  const onCellPress = (coordinate: Coordinate) => {
    const state = visibleState;
    if (!state || animation.isAnimating || state.phase !== Phase.Active || !game.isMyTurn || state.tiePending) return;
    const index = toIdx(coordinate.x, coordinate.y);
    const owner = state.owners[index];
    const isMovable = isMovablePiece(state.pieces[index]!);
    if (!selected) {
      if (owner === game.ownOwner && isMovable) setSelected(coordinate);
      return;
    }
    if (owner === game.ownOwner) {
      if (isMovable) setSelected(selected.x === coordinate.x && selected.y === coordinate.y ? null : coordinate);
      return;
    }
    if (!availableMoves.some(move => move.x === coordinate.x && move.y === coordinate.y)) return;
    const from = selected;
    setSelected(null);
    perform(() => game.movePiece(from.x, from.y, coordinate.x, coordinate.y)).catch(() => undefined);
  };

  const stateMessage = animation.activeKind
    ? getAnimationMessage(animation.activeKind)
    : getStateMessage(visibleState, isParticipant, canEditLineup, hasSubmitted, game.isMyTurn, playerId, isComputer);

  if (!gameId) {
    return (
      <View style={styles.invalidRoom}>
        <StatusBanner message="This invitation contains an invalid room code" tone="error" />
        <PrimaryButton onPress={() => navigation.replace('Home')}>Back to home</PrimaryButton>
      </View>
    );
  }

  if (!game.gameState) {
    return (
      <JoinGate
        gameId={gameId}
        mode={game.error ? 'failed' : 'loading'}
        serverError={game.error}
        onBack={() => navigation.replace('Home')}
        onRetry={game.error ? () => { game.refresh().catch(() => undefined); } : undefined}
      />
    );
  }

  if (!isParticipant) {
    if (hasOpenPlayerSlot && joinStatus !== 'failed') {
      return <JoinGate gameId={gameId} mode="joining" onBack={() => navigation.replace('Home')} />;
    }
    return (
      <JoinGate
        gameId={gameId}
        mode={hasOpenPlayerSlot ? 'failed' : 'unavailable'}
        serverError={joinError || game.error}
        onBack={() => navigation.replace('Home')}
        onRetry={hasOpenPlayerSlot ? () => setJoinStatus('idle') : undefined}
      />
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
          <StatusBanner
            message={stateMessage}
            tone={visibleState?.phase === Phase.Finished ? (visibleState.winner === playerId ? 'success' : 'error') : 'neutral'}
          />
        )}
        {(actionError || game.error) && <StatusBanner message={actionError || game.error || ''} tone="error" />}

        <GameClocks state={game.gameState} ownOwner={game.ownOwner} />

        <GameBoard
          availableMoves={availableMoves}
          interactionEnabled={Boolean(!animation.isAnimating && game.isMyTurn && visibleState?.phase === Phase.Active && !visibleState.tiePending)}
          isPlayer1={game.isPlayer1}
          moveAnimation={animation.activeMove}
          moveProgress={animation.progress}
          onCellPress={onCellPress}
          ownOwner={game.ownOwner}
          previewLineup={canEditLineup ? lineup : undefined}
          selected={selected}
          showOpponentFormation={canEditLineup}
          state={visibleState}
        />

        {canEditLineup && (
          <View style={[styles.lineupPanel, isLineupSaved && styles.lineupPanelReady]} testID="lineup-controls">
            <View style={styles.lineupHeader}>
              <View style={styles.lineupCopy}>
                <Text maxFontSizeMultiplier={2} style={styles.lineupEyebrow}>YOUR LINEUP</Text>
                <Text maxFontSizeMultiplier={2} style={styles.lineupDescription}>
                  {isLineupSaved
                    ? 'Saved. The battle starts automatically when your opponent is ready.'
                    : hasSubmitted ? 'Lineup changed. Save it when you are ready.' : 'Shuffle until the lineup feels right.'}
                </Text>
              </View>
              {isLineupSaved && (
                <View accessibilityLabel="Lineup saved" style={styles.savedBadge}>
                  <View style={styles.savedDot} />
                  <Text maxFontSizeMultiplier={1.6} style={styles.savedText}>READY</Text>
                </View>
              )}
            </View>
            <View style={styles.lineupActions}>
              <View style={styles.lineupAction}>
                <PrimaryButton accessibilityHint="Creates a different random hidden lineup" variant="secondary" onPress={() => {
                  setSelected(null);
                  setLineup(createRandomLineup(game.isPlayer0));
                  setIsLineupDirty(true);
                }}>Shuffle</PrimaryButton>
              </View>
              <View style={styles.lineupAction}>
                <PrimaryButton accessibilityHint="Saves your current hidden lineup" disabled={isLineupSaved} onPress={() => { submitLineup().catch(() => undefined); }} busy={game.isBusy}>
                  {isLineupSaved ? 'Lineup saved' : hasSubmitted ? 'Save changes' : 'Save lineup'}
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

function JoinGate({ gameId, mode, serverError, onBack, onRetry }: {
  gameId: string;
  mode: 'loading' | 'joining' | 'failed' | 'unavailable';
  serverError?: string | null;
  onBack: () => void;
  onRetry?: () => void;
}) {
  const isWorking = mode === 'loading' || mode === 'joining';
  const title = mode === 'loading'
    ? 'Opening battle'
    : mode === 'joining'
      ? 'Joining battle'
      : mode === 'failed' ? 'Couldn’t join battle' : 'Battle unavailable';
  const description = mode === 'loading'
    ? 'Checking the room and its player slot…'
    : mode === 'joining'
      ? 'Your place is being secured. Your lineup is next.'
      : mode === 'failed'
        ? serverError || 'The room could not be joined. Check your connection and try again.'
        : 'This room already has two players or the battle has started.';

  return (
    <View style={styles.joinGate}>
      <View accessibilityLiveRegion="polite" style={styles.joinCard}>
        <View style={[styles.joinIcon, !isWorking && styles.joinIconUnavailable]}>
          {isWorking ? (
            <ActivityIndicator accessibilityLabel={title} accessibilityRole="progressbar" color={colors.primary} size="large" />
          ) : (
            <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.joinIconText}>!</Text>
          )}
        </View>
        <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.joinTitle}>{title}</Text>
        <Text maxFontSizeMultiplier={2} style={styles.joinDescription}>{description}</Text>
        <View accessibilityLabel={`Room ${gameId}`} style={styles.roomPill}>
          <Text maxFontSizeMultiplier={1.6} style={styles.roomPillLabel}>ROOM</Text>
          <Text maxFontSizeMultiplier={1.6} selectable style={styles.roomPillCode}>{gameId}</Text>
        </View>
        {!isWorking && (
          <View style={styles.joinActions}>
            {onRetry && <PrimaryButton onPress={onRetry}>Try again</PrimaryButton>}
            <PrimaryButton variant="secondary" onPress={onBack}>Back to home</PrimaryButton>
          </View>
        )}
      </View>
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

function getStateMessage(state: GameState | null, isParticipant: boolean, canEditLineup: boolean, hasSubmitted: boolean, isMyTurn: boolean, playerId: string | null, isComputer = false) {
  const phase = state?.phase;
  if (phase === undefined) return 'Loading the latest game state…';
  if (!isParticipant && (phase === Phase.Created || phase === Phase.LineupP0Set)) return 'This room has an open player slot';
  if (canEditLineup) {
    if (hasSubmitted) return 'Lineup saved. You can change it until the battle starts';
    return 'Shuffle and save your hidden lineup';
  }
  if (phase === Phase.Created) return isParticipant ? 'Waiting for an opponent to join' : 'This room has an open player slot';
  if (phase === Phase.Active) return isMyTurn ? 'Your turn — select a piece' : isComputer ? "Computer's turn" : "Opponent's turn";
  if (phase === Phase.Finished) {
    if (state?.finishReason === 'timeout') return state.winner === playerId ? 'Victory — opponent ran out of time' : 'Time expired — you lost';
    return state?.winner === playerId ? 'Victory' : 'Game finished';
  }
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
  joinGate: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl },
  joinCard: { width: '100%', maxWidth: 460, alignSelf: 'center', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 24, padding: spacing.xxl, gap: spacing.md },
  joinIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong, borderColor: colors.primaryMuted, borderWidth: 1, marginBottom: spacing.sm },
  joinIconUnavailable: { borderColor: colors.danger },
  joinIconText: { color: colors.danger, fontSize: 34, fontWeight: '900' },
  joinTitle: { color: colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  joinDescription: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 330 },
  roomPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm },
  roomPillLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  roomPillCode: { color: colors.primary, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  joinActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  waitingCard: { backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: 16, padding: spacing.lg, gap: spacing.lg },
  waitingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waitingIndicator: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceStrong, borderColor: colors.primaryMuted, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waitingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  waitingCopy: { flex: 1, gap: spacing.xs },
  waitingTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  waitingDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  lineupPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.lg, gap: spacing.lg },
  lineupPanelReady: { borderColor: colors.success },
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
