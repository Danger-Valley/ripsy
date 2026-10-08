import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { canMoveTo, Choice, FigureVariant, HEIGHT, isMovablePiece, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard, type LineupPiece } from '../components/game-board';
import { GameClocks } from '../components/game-clocks';
import { VictoryFireworks } from '../components/victory-fireworks';
import { BattleResultPanel, JoinGate, LineupPanel, WaitingPanel, WeaponChoiceModal } from '../components/battle-panels';
import { ToyHomeButton } from '../components/toy-home-controls';
import { StatusBanner } from '../components/status-banner';
import { BattleStatus, ToyBattleShell } from '../components/toy-battle-shell';
import { useLocalComputerGame } from '../hooks/use-local-computer-game';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { useGameAnimationQueue } from '../hooks/use-game-animation-queue';
import { useBattleSounds, useBattleResultSound } from '../hooks/use-battle-sounds';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { isCompletedMoveTransition } from '../game-animation';
import { haptics } from '../haptics';
import { createGameInviteUrl, normalizeRoomCode } from '../invitations';
import { LOCAL_PLAYER_ID } from '../local-computer-game';
import type { RootStackParamList } from '../navigation';
import { spacing } from '../theme';
import { loadFigureSlots, loadFigureVariants, saveFigureSlots } from '../storage/figure-loadout';
import { ShopClient } from '@rps/game-client/shop';
import { equippedFigureVariant, figureAssetVariants, FIGURE_SLOTS } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;
type ComputerProps = NativeStackScreenProps<RootStackParamList, 'ComputerGame'>;
type Coordinate = { x: number; y: number };
type JoinStatus = 'idle' | 'joining' | 'joined' | 'failed';

export function GameScreen({ navigation, route }: Props) {
  const gameId = normalizeRoomCode(route.params.gameId) ?? '';
  const { playerId, sessionToken } = usePlayerIdentity();
  const game = useNativeRipsyGame(playerId, sessionToken, gameId);

  return (
    <ToyBattleShell title={`Battle ${gameId}`} onBack={() => navigation.replace('Home')}>
      <BattleScreen game={game} gameId={gameId} isComputer={false} navigation={navigation} playerId={playerId} sessionToken={sessionToken} />
    </ToyBattleShell>
  );
}

export function ComputerGameScreen({ navigation }: ComputerProps) {
  const [presentationBusy, setPresentationBusy] = useState(false);
  const game = useLocalComputerGame(presentationBusy);
  return (
    <ToyBattleShell title="Battle vs Computer" onBack={() => navigation.replace('Home')}>
      <BattleScreen
        game={game}
        gameId="computer"
        isComputer
        navigation={navigation}
        onAnimationStateChange={setPresentationBusy}
        playerId={LOCAL_PLAYER_ID}
      />
    </ToyBattleShell>
  );
}

function BattleScreen({ game, gameId, isComputer, navigation, onAnimationStateChange, playerId, sessionToken }: {
  game: ReturnType<typeof useNativeRipsyGame> | ReturnType<typeof useLocalComputerGame>;
  gameId: string;
  isComputer: boolean;
  navigation: Props['navigation'] | ComputerProps['navigation'];
  onAnimationStateChange?: (isAnimating: boolean) => void;
  playerId: string;
  sessionToken?: string;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Fit the active board + clocks + status in a portrait viewport. On short
  // screens keep playable cells usable and allow vertical scrolling instead.
  const boardMaxSize = Math.max(340, height - insets.top - insets.bottom - 260);
  const { joinGame } = game;
  const playSound = useBattleSounds();
  const animation = useGameAnimationQueue(game.gameState, playSound);
  const visibleState = animation.displayedState ?? game.gameState;
  useBattleResultSound(visibleState, animation.isAnimating, playerId);
  const [lineup, setLineup] = useState<LineupPiece[]>([]);
  const [isLineupDirty, setIsLineupDirty] = useState(false);
  const [selected, setSelected] = useState<Coordinate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const previousPhase = useRef<Phase | undefined>(undefined);
  const previousTiePending = useRef(false);
  const previousMoveState = useRef<GameState | null>(null);
  const lineupAttention = useRef(new Animated.Value(0)).current;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState<boolean | null>(null);
  const [armyFigureSlots, setArmyFigureSlots] = useState<Array<string | null> | null>(null);
  const [armyFigureVariants, setArmyFigureVariants] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      let slots = await loadFigureSlots();
      let variants = await loadFigureVariants();
      if (sessionToken) {
        try {
          const client = new ShopClient(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken);
          const inventory = await client.inventory();
          slots = inventory.slots;
          variants = figureAssetVariants(inventory.assets);
          await saveFigureSlots(slots, inventory.assets);
        } catch {
          // A wallet is optional. The cached army remains available offline.
        }
      }
      if (active) { setArmyFigureVariants(variants); setArmyFigureSlots(slots); }
    };
    load().catch(() => {
      if (active) setArmyFigureSlots(Array<string | null>(FIGURE_SLOTS).fill(null));
    });
    return () => { active = false; };
  }, [sessionToken]);

  useEffect(() => {
    onAnimationStateChange?.(animation.isAnimating);
  }, [animation.isAnimating, onAnimationStateChange]);

  useEffect(() => () => onAnimationStateChange?.(false), [onAnimationStateChange]);

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
  const isFinished = game.gameState?.phase === Phase.Finished;
  // A command racing the server deadline can fail after the result arrives.
  // The confirmed result explains this case; keep unrelated failures visible.
  const battleError = [actionError, game.error].find(error => error
    && !(isFinished && error === 'The game is not active'));

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (isMounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        if (isMounted) setReduceMotionEnabled(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    lineupAttention.stopAnimation();
    if (!canEditLineup || isLineupSaved) {
      lineupAttention.setValue(0);
      return;
    }
    if (reduceMotionEnabled !== false) {
      lineupAttention.setValue(1);
      return;
    }
    lineupAttention.setValue(0);
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(lineupAttention, {
        toValue: 1,
        duration: 500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(lineupAttention, {
        toValue: 0,
        duration: 500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]));
    pulse.start();
    return () => {
      pulse.stop();
      lineupAttention.stopAnimation();
    };
  }, [canEditLineup, isLineupSaved, lineupAttention, reduceMotionEnabled]);

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
    if (!canEditLineup || lineup.length > 0 || !game.gameState || !armyFigureSlots) return;
    const savedLineup = lineupFromState(game.gameState, game.ownOwner);
    if (savedLineup.length > 0) {
      setLineup(savedLineup);
      setIsLineupDirty(false);
    } else {
      setLineup(createRandomLineup(game.isPlayer0, armyFigureSlots, armyFigureVariants));
      setIsLineupDirty(true);
    }
  }, [armyFigureSlots, armyFigureVariants, canEditLineup, game.gameState, game.isPlayer0, game.ownOwner, lineup.length]);

  useEffect(() => {
    if (!game.gameState?.tiePending || isFinished) setSelected(null);
  }, [game.gameState?.tiePending, isFinished]);

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
    const state = visibleState;
    if (!selected || !state || animation.isAnimating || !game.isMyTurn || state.phase !== Phase.Active) return [];
    const selectedPiece = state.pieces[toIdx(selected.x, selected.y)] ?? Piece.Empty;
    return [
      { x: selected.x + 1, y: selected.y },
      { x: selected.x - 1, y: selected.y },
      { x: selected.x, y: selected.y + 1 },
      { x: selected.x, y: selected.y - 1 },
    ].filter(position => position.x >= 0 && position.x < WIDTH && position.y >= 0 && position.y < HEIGHT)
      .filter(position => canMoveTo(selectedPiece, state.owners[toIdx(position.x, position.y)] ?? Owner.None));
  }, [animation.isAnimating, game.isMyTurn, selected, visibleState]);

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
    playSound('ready');
  };

  const shareRoom = () => perform(async () => {
    const inviteUrl = createGameInviteUrl(gameId);
    await Share.share(Platform.OS === 'ios'
      ? { title: 'Join my RIPSY game', message: 'Join my RIPSY game', url: inviteUrl }
      : { title: 'Join my RIPSY game', message: `Join my RIPSY game: ${inviteUrl}` });
  });

  const onCellPress = (coordinate: Coordinate) => {
    const state = visibleState;
    if (!state || game.gameState?.phase !== Phase.Active || game.isBusy || animation.isAnimating || state.phase !== Phase.Active || !game.isMyTurn || state.tiePending) return;
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
        <ToyHomeButton tone="white" onPress={() => navigation.replace('Home')}>Back to home</ToyHomeButton>
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
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        {isWaitingForOpponent && <WaitingPanel gameId={gameId} onInvite={() => { shareRoom().catch(() => undefined); }} />}
        {battleError && <StatusBanner message={battleError} tone="error" />}

        <GameClocks state={game.gameState} ownOwner={game.ownOwner} />

        <GameBoard
          maxSize={boardMaxSize}
          availableMoves={availableMoves}
          combatAnimation={animation.activeCombat}
          combatPhase={animation.combatPhase}
          interactionEnabled={Boolean(game.gameState.phase === Phase.Active && !game.isBusy && !animation.isAnimating && game.isMyTurn && visibleState?.phase === Phase.Active && !visibleState.tiePending)}
          isPlayer1={game.isPlayer1}
          moveAnimation={animation.activeMove}
          moveProgress={animation.progress}
          trapAnimation={animation.activeTrap}
          trapAnimationSequence={animation.activeTrapSequence}
          onCellPress={onCellPress}
          onMoveActionTriggered={animation.startActiveMove}
          onMoveDestinationReady={animation.completeActiveMoveLanding}
          onTrapActionTriggered={animation.startActiveTrap}
          onCombatActionTriggered={animation.startActiveAttack}
          ownOwner={game.ownOwner}
          previewLineup={canEditLineup ? lineup : undefined}
          selected={selected}
          showOpponentFormation={canEditLineup}
          state={visibleState}
        />

        {!isWaitingForOpponent && <BattleStatus
          message={stateMessage}
          opponent={!game.isMyTurn && visibleState?.phase === Phase.Active}
          tone={visibleState?.phase === Phase.Finished ? (visibleState.winner === playerId ? 'success' : 'error') : 'neutral'}
        />}

        {visibleState?.phase === Phase.Finished && (
          <BattleResultPanel
            outcome={visibleState.finishReason === 'lineup_timeout' ? 'cancelled' : visibleState.winner === playerId ? 'victory' : 'defeat'}
            reason={visibleState.finishReason}
            onBack={() => navigation.replace('Home')}
          />
        )}

        {canEditLineup && <LineupPanel
          saved={isLineupSaved}
          hasSubmitted={hasSubmitted}
          busy={game.isBusy}
          deadlineAt={game.gameState?.lineupDeadlineAt}
          attention={lineupAttention}
          onShuffle={() => {
            playSound('shuffle');
            setSelected(null);
            setLineup(createRandomLineup(game.isPlayer0, armyFigureSlots ?? Array<string | null>(FIGURE_SLOTS).fill(null), armyFigureVariants));
            setIsLineupDirty(true);
          }}
          onSave={() => { submitLineup().catch(() => undefined); }}
        />}
      </ScrollView>

      <WeaponChoiceModal
        busy={game.isBusy}
        isOpen={Boolean(game.gameState.phase === Phase.Active && !animation.isAnimating && visibleState?.tiePending && visibleState.playerChoice === Choice.None && isParticipant)}
        onChoose={choice => {
          if (game.gameState?.phase !== Phase.Active || game.isBusy) return;
          perform(() => game.chooseWeapon(choice)).catch(() => undefined);
        }}
      />
      <VictoryFireworks
        victoryId={visibleState?.phase === Phase.Finished && visibleState.winner === playerId
          && visibleState.finishReason !== 'lineup_timeout' && !animation.isAnimating ? `${gameId}:${playerId}` : null}
        reduceMotionEnabled={reduceMotionEnabled}
      />
    </View>
  );
}

function getAnimationMessage(kind: 'move' | 'battle' | 'trap' | 'phase') {
  if (kind === 'battle') return 'Resolving battle…';
  if (kind === 'trap') return 'Trap triggered…';
  if (kind === 'move') return 'Moving piece…';
  return 'Updating game…';
}

function getStateMessage(state: GameState | null, isParticipant: boolean, canEditLineup: boolean, hasSubmitted: boolean, isMyTurn: boolean, playerId: string | null, isComputer = false) {
  const phase = state?.phase;
  if (phase === undefined) return 'Loading the latest game state…';
  if (!isParticipant && (phase === Phase.Created || phase === Phase.LineupP0Set)) return 'This room has an open player slot';
  if (canEditLineup) {
    if (hasSubmitted) return 'Lineup saved. You can change it until the battle starts';
    return 'Set your lineup using the controls below the board';
  }
  if (phase === Phase.Created) return isParticipant ? 'Waiting for an opponent to join' : 'This room has an open player slot';
  if (phase === Phase.Active) return isMyTurn ? 'Your turn - select a piece' : isComputer ? "Computer's turn" : "Opponent's turn";
  if (phase === Phase.Finished) {
    if (state?.finishReason === 'lineup_timeout') return 'Game canceled - a lineup was not saved in time';
    if (state?.finishReason === 'timeout') return state.winner === playerId ? 'Victory - opponent ran out of time' : 'Time expired - you lost';
    return state?.winner === playerId ? 'Victory' : 'Game finished';
  }
  return 'Preparing game…';
}

function saveLineup(
  submit: (xs: number[], ys: number[], pieces: number[], figureVariants?: number[], figureAssetIds?: Array<string | null>) => Promise<unknown>,
  lineup: LineupPiece[],
) {
  return submit(
    lineup.map(item => item.x),
    lineup.map(item => item.y),
    lineup.map(item => item.piece),
    lineup.map(item => item.figureVariant ?? FigureVariant.Fig1),
    lineup.map(item => item.figureAssetId ?? null),
  );
}

function lineupFromState(state: GameState, owner: Owner): LineupPiece[] {
  const lineup: LineupPiece[] = [];
  for (let index = 0; index < state.owners.length; index += 1) {
    if (state.owners[index] !== owner || state.pieces[index] === Piece.Empty) continue;
    lineup.push({ x: index % WIDTH, y: Math.floor(index / WIDTH), piece: state.pieces[index]!, figureVariant: state.figureVariants?.[index] ?? FigureVariant.Fig1 });
  }
  return lineup;
}

function createRandomLineup(isPlayer0: boolean, configuredSlots: Array<string | null>, variants: Record<string, number> = {}): LineupPiece[] {
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
  const figureSlots = configuredSlots.length === FIGURE_SLOTS
    ? configuredSlots.map(figureAssetId => ({
      figureAssetId,
      figureVariant: equippedFigureVariant(figureAssetId, variants),
    }))
    : Array.from({ length: FIGURE_SLOTS }, () => ({ figureAssetId: null, figureVariant: FigureVariant.Fig1 }));
  shuffle(pieces);
  shuffle(cells);
  shuffle(figureSlots);
  return pieces.map((piece, index) => ({ ...cells[index]!, piece, ...figureSlots[index]! }));
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [items[index], items[target]] = [items[target]!, items[index]!];
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  invalidRoom: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.md },
});
