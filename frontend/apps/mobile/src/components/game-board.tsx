import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { useRiveFile, type RiveFile } from '@rive-app/react-native';
import { FigureVariant, HEIGHT, isMovablePiece, Owner, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { haptics } from '../haptics';
import { sounds } from '../audio/sounds';
import { colors } from '../theme';
import { RIVE_JUMP_TRAVEL_DELAY_MS, type CombatAnimation, type CombatAnimationPhase, type PieceMoveAnimation, type TrapAnimation } from '../game-animation';
import { RiveGamePiece, type RiveActionTrigger } from './rive-game-piece';
import { useLastOpponentMove } from '../hooks/use-last-opponent-move';

const figure1Asset = require('../assets/figures/fig1.riv');
const figure2Asset = require('../assets/figures/fig2.riv');
const bonkAsset = require('../assets/figures/bonk.riv');
const jupAsset = require('../assets/figures/jup.riv');
const boardArenaAsset = require('../assets/ui/battle-toy-frame-v2.png');
const boardBorderWidth = 0;
// Match the inspected blank sand aperture, not the requested AI prompt geometry.
// Keep the full illustration visible so flags and turrets are never cropped.
export const BOARD_PLAYABLE_RATIO = 0.84;
const combatHalfSeparationInCells = 0.42;
const arrowAssets = {
  up: require('../assets/arrows/up.png'),
  down: require('../assets/arrows/down.png'),
  left: require('../assets/arrows/left.png'),
  right: require('../assets/arrows/right.png'),
} satisfies Record<string, ImageSourcePropType>;

export interface LineupPiece {
  x: number;
  y: number;
  piece: Piece;
  figureVariant?: FigureVariant;
  figureAssetId?: string | null;
}

interface Coordinate {
  x: number;
  y: number;
}

interface Props {
  maxSize?: number;
  state: GameState | null;
  ownOwner: Owner;
  isPlayer1: boolean;
  previewLineup?: LineupPiece[];
  selected?: Coordinate | null;
  availableMoves?: Coordinate[];
  interactionEnabled?: boolean;
  combatAnimation?: CombatAnimation | null;
  combatPhase?: CombatAnimationPhase | null;
  moveAnimation?: PieceMoveAnimation | null;
  moveProgress?: Animated.Value;
  trapAnimation?: TrapAnimation | null;
  trapAnimationSequence?: number;
  showOpponentFormation?: boolean;
  onCellPress?: (coordinate: Coordinate) => void;
  onMoveActionTriggered?: (travelDelayMs?: number) => void;
  onMoveDestinationReady?: () => void;
  onTrapActionTriggered?: (trigger: 'Trap Activate' | 'Fall In Trap') => void;
  onCombatActionTriggered?: () => void;
}

export function GameBoard({ maxSize = 620, state, ownOwner, isPlayer1, previewLineup, selected, availableMoves = [], interactionEnabled = false, combatAnimation, combatPhase, moveAnimation, moveProgress, trapAnimation, trapAnimationSequence = 0, showOpponentFormation = false, onCellPress, onMoveActionTriggered, onMoveDestinationReady, onTrapActionTriggered, onCombatActionTriggered }: Props) {
  const { width } = useWindowDimensions();
  const { riveFile: figure1File } = useRiveFile(figure1Asset);
  const { riveFile: figure2File } = useRiveFile(figure2Asset);
  const { riveFile: bonkFile } = useRiveFile(bonkAsset);
  const { riveFile: jupFile } = useRiveFile(jupAsset);
  const figureFiles = [null, figure1File, figure2File, bonkFile, jupFile];
  const boardSize = Math.max(1, Math.min(width - 24, 620, maxSize));
  const playableSize = boardSize * BOARD_PLAYABLE_RATIO;
  const playableInset = (boardSize - playableSize) / 2;
  const cellSize = playableSize / WIDTH;
  const preview = useMemo(() => new Map(previewLineup?.map(item => [toIdx(item.x, item.y), item])), [previewLineup]);
  const lastOpponentMove = useLastOpponentMove(state, ownOwner);
  const lastMoveDisplay = lastOpponentMove && !previewLineup && !showOpponentFormation
    ? toDisplayCoordinate(lastOpponentMove, isPlayer1) : null;
  const movingDisplayFrom = moveAnimation ? toDisplayCoordinate(moveAnimation.from, isPlayer1) : null;
  const trapDisplayTo = trapAnimation ? toDisplayCoordinate(trapAnimation.to, isPlayer1) : null;
  const handleMoveActionTriggered = useCallback(() => {
    onMoveActionTriggered?.(RIVE_JUMP_TRAVEL_DELAY_MS);
  }, [onMoveActionTriggered]);

  return (
    <View accessible={false} style={[styles.board, { width: boardSize, height: boardSize }]} testID="game-board">
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.boardFrame}>
        <Image source={boardArenaAsset} style={styles.boardArenaArt} />
      </View>
      <View style={[styles.playfield, { left: playableInset, top: playableInset, width: playableSize, height: playableSize }]}>
        <View pointerEvents="none" style={styles.boardSurface} testID="board-surface">
          <View style={styles.grid} testID="board-grid">
            {Array.from({ length: HEIGHT }, (_, displayY) => (
              <View key={displayY} style={styles.gridRow}>
                {Array.from({ length: WIDTH }, (_unused, displayX) => (
                  <View
                    key={displayX}
                    style={[
                      styles.gridCell,
                      { width: cellSize, height: cellSize },
                      (displayX + displayY) % 2 === 0 && styles.alternateGridCell,
                      lastMoveDisplay?.x === displayX && lastMoveDisplay.y === displayY && styles.lastOpponentMoveCell,
                    ]}
                    testID={lastMoveDisplay?.x === displayX && lastMoveDisplay.y === displayY ? 'last-opponent-move-cell' : undefined}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
        {Array.from({ length: HEIGHT }, (_, displayY) => (
          <View
            collapsable={false}
            key={displayY}
            style={[
              styles.row,
              movingDisplayFrom?.y === displayY && styles.movingRow,
              trapDisplayTo?.y === displayY && styles.trapDestinationRow,
            ]}
            testID={movingDisplayFrom?.y === displayY ? 'moving-source-row' : undefined}>
            {Array.from({ length: WIDTH }, (_unused, displayX) => {
            const x = isPlayer1 ? WIDTH - 1 - displayX : displayX;
            const y = isPlayer1 ? HEIGHT - 1 - displayY : displayY;
            const index = toIdx(x, y);
            const previewItem = preview.get(index);
            const serverOwner = state?.owners[index] ?? Owner.None;
            const isMovingSource = moveAnimation?.from.x === x && moveAnimation.from.y === y;
            const isMovingDestination = moveAnimation?.to.x === x && moveAnimation.to.y === y;
            const isTrapDestination = trapAnimation?.to.x === x && trapAnimation.to.y === y;
            const isOpponentPreview = Boolean(showOpponentFormation && displayY < 2 && previewItem === undefined && serverOwner === Owner.None);
            const owner = isMovingSource && moveAnimation
              ? moveAnimation.owner
              : previewItem !== undefined
                ? ownOwner
                : isOpponentPreview ? opponentOf(ownOwner) : serverOwner;
            const piece = isMovingSource && moveAnimation
              ? moveAnimation.piece
              : previewItem?.piece ?? state?.pieces[index] ?? Piece.Empty;
            const figureVariant = isMovingSource && moveAnimation
              ? moveAnimation.figureVariant
              : previewItem?.figureVariant
                ?? (isOpponentPreview
                  ? ((displayX + displayY * WIDTH) % 2 === 0 ? FigureVariant.Fig1 : FigureVariant.Fig2)
                  : state?.figureVariants?.[index] ?? FigureVariant.Fig1);
            const riveFile = figureFiles[figureVariant ?? FigureVariant.Fig1];
            const isMine = owner === ownOwner && ownOwner !== Owner.None;
            const isCombatLandingDestination = Boolean(
              combatAnimation?.resolution === 'resolved'
              && combatPhase === 'settle'
              && combatAnimation.to.x === x
              && combatAnimation.to.y === y,
            );
            const isCombatant = Boolean(combatAnimation && !isCombatLandingDestination && (
              (combatAnimation.from.x === x && combatAnimation.from.y === y)
              || (combatAnimation.to.x === x && combatAnimation.to.y === y)
            ));
            const isSelected = selected?.x === x && selected.y === y;
            const isAvailable = availableMoves.some(move => move.x === x && move.y === y);
            const isMovable = isMovablePiece(piece);
            const isActionable = Boolean(interactionEnabled && onCellPress && (selected ? (isMine && isMovable) || isAvailable : isMine && isMovable));
            const occupant = owner === Owner.None
              ? 'empty'
              : isMine ? `your ${pieceName(piece)}` : 'opponent piece';
            const hint = isSelected
              ? 'Selected piece'
              : isAvailable ? 'Move selected piece here' : isActionable ? 'Select this piece' : undefined;
            const isLastOpponentMove = lastMoveDisplay?.x === displayX && lastMoveDisplay.y === displayY;
            return (
              <Pressable
                collapsable={false}
                accessibilityRole={isActionable ? 'button' : 'text'}
                accessibilityLabel={`Row ${displayY + 1}, column ${displayX + 1}, ${occupant}`}
                accessibilityHint={isLastOpponentMove ? [hint, 'Opponent last moved here'].filter(Boolean).join('. ') : hint}
                accessibilityState={{ disabled: !isActionable, selected: isSelected }}
                disabled={!isActionable}
                key={displayX}
                onPress={() => {
                  if (!isAvailable) { haptics.select(); sounds.play('select'); }
                  onCellPress?.({ x, y });
                }}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  isAvailable && styles.availableCell,
                  isSelected && styles.selectedCell,
                  isMovingSource && styles.movingCell,
                  isTrapDestination && styles.trapDestinationCell,
                ]}>
                {owner !== Owner.None && !isCombatant ? (
                  <Animated.View
                    pointerEvents="none"
                    testID="piece-visual"
                    style={[
                      styles.piece,
                      isMovingSource && styles.movingPiece,
                      (isMovingDestination || isCombatLandingDestination) && styles.landingPiecePreload,
                      {
                        width: cellSize * 0.88,
                        height: cellSize * 0.88,
                        transform: isMovingSource && moveAnimation && moveProgress
                          ? movingPieceTransform(cellSize, isPlayer1, moveAnimation, moveProgress)
                          : [{ translateY: -cellSize * (isOpponentPreview ? 0.34 : 0.43) }],
                      },
                    ]}>
                    {riveFile ? (
                      <StationaryBoardPiece
                        collisionSequence={isTrapDestination ? trapAnimationSequence : undefined}
                        actionTrigger={isTrapDestination
                          ? 'Trap Activate'
                          : isMovingSource && moveAnimation
                            ? jumpTriggerForMove(moveAnimation, isPlayer1)
                            : undefined}
                        file={riveFile}
                        isMine={isMine}
                        key="piece"
                        onActionTriggered={isTrapDestination
                          ? trigger => onTrapActionTriggered?.(trigger as 'Trap Activate')
                          : isMovingSource
                            ? handleMoveActionTriggered
                            : undefined}
                        onConfigured={isMovingDestination ? onMoveDestinationReady : undefined}
                        piece={piece}
                        size={cellSize * 1.68}
                        staggerStart={isOpponentPreview}
                      />
                    ) : null}
                  </Animated.View>
                ) : isAvailable && selected ? (
                  <Image source={moveArrowSource(selected, { x, y }, isPlayer1)} style={styles.moveArrow} />
                ) : null}
              </Pressable>
            );
            })}
          </View>
        ))}
        {combatAnimation && combatPhase && moveProgress && figureFiles[combatAnimation.attackerFigureVariant ?? FigureVariant.Fig1] && figureFiles[combatAnimation.defenderFigureVariant ?? FigureVariant.Fig1] ? (
          <CombatScene
            cellSize={cellSize}
            combat={combatAnimation}
            isPlayer1={isPlayer1}
            ownOwner={ownOwner}
            phase={combatPhase}
            progress={moveProgress}
            figureFiles={figureFiles}
            onAttack={onCombatActionTriggered}
          />
        ) : null}
        {trapAnimation && (figureFiles[trapAnimation.attackerFigureVariant ?? FigureVariant.Fig1]) ? (
          <TrapScene
            animation={trapAnimation}
            cellSize={cellSize}
            isPlayer1={isPlayer1}
            onActionTriggered={onTrapActionTriggered}
            ownOwner={ownOwner}
            riveFile={figureFiles[trapAnimation.attackerFigureVariant ?? FigureVariant.Fig1]!}
            key={`trap-victim-${trapAnimationSequence}`}
          />
        ) : null}
      </View>
    </View>
  );
}

function StationaryBoardPiece({ collisionSequence, ...props }: ComponentProps<typeof RiveGamePiece> & { collisionSequence?: number }) {
  const [lastCollisionSequence, setLastCollisionSequence] = useState(collisionSequence);
  // Adjust before commit, not in an effect: an event gets one fresh controller.
  // Keep that event key after completion. Returning to 'piece' would initialize
  // a second Front trap and visibly replay its Trap Activate timeline.
  if (collisionSequence !== undefined && collisionSequence !== lastCollisionSequence) {
    setLastCollisionSequence(collisionSequence);
  }
  return <RiveGamePiece key={lastCollisionSequence === undefined ? 'piece' : `trap-${lastCollisionSequence}`} {...props} />;
}

function TrapScene({ animation, cellSize, isPlayer1, onActionTriggered, ownOwner, riveFile }: {
  animation: TrapAnimation;
  cellSize: number;
  isPlayer1: boolean;
  onActionTriggered?: Props['onTrapActionTriggered'];
  ownOwner: Owner;
  riveFile: RiveFile;
}) {
  const destination = toDisplayCoordinate(animation.to, isPlayer1);
  return (
    <View pointerEvents="none" style={styles.trapLayer} testID="trap-scene">
      <View
        style={[
          styles.trapVictim,
          {
            height: cellSize,
            left: boardBorderWidth + destination.x * cellSize,
            top: boardBorderWidth + destination.y * cellSize,
            width: cellSize,
          },
        ]}>
        <View style={[styles.piece, { width: cellSize * 0.88, height: cellSize * 0.88, transform: [{ translateY: -cellSize * 0.43 }] }]}>
          <RiveGamePiece
            actionTrigger="Fall In Trap"
            file={riveFile}
            isMine={animation.attackerOwner === ownOwner}
            onActionTriggered={trigger => onActionTriggered?.(trigger as 'Fall In Trap')}
            piece={animation.attackerPiece}
            preserveStateOnPieceChange
            size={cellSize * 1.68}
          />
        </View>
      </View>
    </View>
  );
}

function CombatScene({ cellSize, combat, isPlayer1, ownOwner, phase, progress, figureFiles, onAttack }: {
  cellSize: number;
  combat: CombatAnimation;
  isPlayer1: boolean;
  ownOwner: Owner;
  phase: CombatAnimationPhase;
  progress: Animated.Value;
  figureFiles: Array<RiveFile | null | undefined>;
  onAttack?: () => void;
}) {
  const attacker = toDisplayCoordinate(combat.from, isPlayer1);
  const defender = toDisplayCoordinate(combat.to, isPlayer1);
  const attackerIsMine = combat.attackerOwner === ownOwner;
  const defenderIsMine = combat.defenderOwner === ownOwner;
  return (
    <>
      <Combatant
        cellSize={cellSize}
        isMine={attackerIsMine}
        isWinner={combat.winnerOwner === combat.attackerOwner}
        phase={phase}
        piece={combat.attackerPiece}
        position={attacker}
        progress={progress}
        riveFile={figureFiles[combat.attackerFigureVariant ?? FigureVariant.Fig1]!}
        target={defender}
        targetSide={attackerIsMine ? -1 : 1}
        winnerDestination={defender}
        onAttack={onAttack}
      />
      <Combatant
        cellSize={cellSize}
        isMine={defenderIsMine}
        isWinner={combat.winnerOwner === combat.defenderOwner}
        phase={phase}
        piece={combat.defenderPiece}
        position={defender}
        progress={progress}
        riveFile={figureFiles[combat.defenderFigureVariant ?? FigureVariant.Fig1]!}
        target={attacker}
        targetSide={defenderIsMine ? -1 : 1}
        winnerDestination={defender}
        onAttack={onAttack}
      />
    </>
  );
}

function Combatant({ cellSize, isMine, isWinner, phase, piece, position, progress, riveFile, target, targetSide, winnerDestination, onAttack }: {
  cellSize: number;
  isMine: boolean;
  isWinner: boolean;
  phase: CombatAnimationPhase;
  piece: Piece;
  position: Coordinate;
  progress: Animated.Value;
  riveFile: RiveFile;
  target: Coordinate;
  targetSide: -1 | 1;
  winnerDestination: Coordinate;
  onAttack?: () => void;
}) {
  const handleActionTriggered = useCallback((action: RiveActionTrigger) => { if (action === 'Attack') onAttack?.(); }, [onAttack]);
  const centerX = ((position.x + target.x + 1) / 2) * cellSize;
  const centerY = ((position.y + target.y + 1) / 2) * cellSize;
  const finalLeft = centerX + targetSide * cellSize * combatHalfSeparationInCells - cellSize / 2;
  const finalTop = centerY - cellSize / 2;
  const startLeft = position.x * cellSize;
  const startTop = position.y * cellSize;
  const fightTranslateX = finalLeft - startLeft;
  const fightTranslateY = finalTop - startTop;
  const winnerTranslateX = winnerDestination.x * cellSize - startLeft;
  const winnerTranslateY = winnerDestination.y * cellSize - startTop;
  const translateX = progress.interpolate({
    inputRange: [0, 0.25, 1, 3, 4],
    outputRange: [0, 0, fightTranslateX, fightTranslateX, isWinner ? winnerTranslateX : fightTranslateX],
    extrapolate: 'clamp',
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.25, 1, 3, 4],
    outputRange: [0, 0, fightTranslateY, fightTranslateY, isWinner ? winnerTranslateY : fightTranslateY],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({ inputRange: [0, 1, 1.35, 3, 4], outputRange: [1, 1, 2, 2, 1], extrapolate: 'clamp' });
  const opacity = progress.interpolate({
    inputRange: [0, 2, 3, 4],
    outputRange: isWinner ? [1, 1, 1, 1] : [1, 1, 0, 0],
    extrapolate: 'clamp',
  });
  const trigger: RiveActionTrigger | undefined = phase === 'prepare'
    ? 'Attack Prepare'
    : phase === 'attack' && isWinner
      ? 'Attack'
      : phase === 'death' && !isWinner ? 'Death' : undefined;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.combatant,
        {
          height: cellSize,
          left: startLeft,
          opacity,
          top: startTop,
          transform: [{ translateX }, { translateY }, { scale }],
          width: cellSize,
        },
        isWinner ? styles.combatWinner : styles.combatLoser,
      ]}
      testID={isWinner ? 'combat-winner' : 'combat-loser'}>
      <View style={[styles.piece, { width: cellSize * 0.88, height: cellSize * 0.88, transform: [{ translateY: -cellSize * 0.43 }] }]}>
        <RiveGamePiece
          actionTrigger={trigger}
          onActionTriggered={handleActionTriggered}
          file={riveFile}
          isMine={isMine}
          piece={piece}
          preserveStateOnPieceChange
          size={cellSize * 1.68}
        />
      </View>
    </Animated.View>
  );
}

function movingPieceTransform(cellSize: number, isPlayer1: boolean, move: PieceMoveAnimation, progress: Animated.Value) {
  const from = toDisplayCoordinate(move.from, isPlayer1);
  const to = toDisplayCoordinate(move.to, isPlayer1);
  const deltaX = (to.x - from.x) * cellSize;
  const deltaY = (to.y - from.y) * cellSize;
  const restingOffset = -cellSize * 0.43;
  const lift = cellSize * 0.22;
  // Progress 0..1 is the full authored Rive jump timeline. Container travel
  // starts with the Rive trigger and lands when that timeline finishes.
  const peak = 0.45;
  const landing = 0.82;
  const translateX = progress.interpolate({
    inputRange: [0, peak, landing, 1, 2],
    outputRange: [0, deltaX * 0.48, deltaX * 0.9, deltaX, deltaX],
    extrapolate: 'clamp',
  });
  const translateY = progress.interpolate({
    inputRange: [0, peak, landing, 1, 2],
    outputRange: [
      restingOffset,
      restingOffset + deltaY * 0.48 - lift,
      restingOffset + deltaY * 0.9 - lift * 0.25,
      restingOffset + deltaY,
      restingOffset + deltaY,
    ],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({
    inputRange: [0, peak, landing, 1, 2],
    outputRange: [1, 1.04, 1.01, 1, 1],
    extrapolate: 'clamp',
  });
  return [{ translateX }, { translateY }, { scale }];
}

function jumpTriggerForMove(move: PieceMoveAnimation, isPlayer1: boolean): RiveActionTrigger {
  const from = toDisplayCoordinate(move.from, isPlayer1);
  const to = toDisplayCoordinate(move.to, isPlayer1);
  if (to.x < from.x) return 'Jump Left';
  if (to.x > from.x) return 'Jump Right';
  return 'Jump Forward';
}

function toDisplayCoordinate(coordinate: Coordinate, isPlayer1: boolean): Coordinate {
  return isPlayer1
    ? { x: WIDTH - 1 - coordinate.x, y: HEIGHT - 1 - coordinate.y }
    : coordinate;
}

function moveArrowSource(selected: Coordinate, target: Coordinate, isPlayer1: boolean): ImageSourcePropType {
  const directionX = (target.x - selected.x) * (isPlayer1 ? -1 : 1);
  const directionY = (target.y - selected.y) * (isPlayer1 ? -1 : 1);
  if (directionX > 0) return arrowAssets.right;
  if (directionX < 0) return arrowAssets.left;
  if (directionY > 0) return arrowAssets.down;
  return arrowAssets.up;
}

function pieceName(piece: Piece) {
  if (piece === Piece.Rock) return 'rock';
  if (piece === Piece.Paper) return 'paper';
  if (piece === Piece.Scissors) return 'scissors';
  if (piece === Piece.Flag) return 'flag';
  if (piece === Piece.Trap) return 'trap';
  return 'piece';
}

function opponentOf(owner: Owner): Owner {
  if (owner === Owner.P0) return Owner.P1;
  if (owner === Owner.P1) return Owner.P0;
  return Owner.None;
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', overflow: 'visible', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 13, elevation: 7 },
  boardFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 22, backgroundColor: colors.boardGrass },
  boardArenaArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'contain' },
  playfield: { position: 'absolute', overflow: 'visible' },
  boardSurface: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: boardBorderWidth, borderRadius: 10, overflow: 'visible' },
  grid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  gridRow: { flexDirection: 'row' },
  gridCell: { backgroundColor: 'rgba(232, 200, 140, 0.30)', borderColor: 'rgba(177, 142, 83, 0.38)', borderWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.65)' },
  alternateGridCell: { backgroundColor: 'rgba(255, 247, 221, 0.38)' },
  lastOpponentMoveCell: { backgroundColor: colors.boardOpponentLastMove, borderColor: colors.boardOpponentLastMoveBorder, borderTopColor: colors.boardOpponentLastMoveBorder },
  row: { flexDirection: 'row', overflow: 'visible' },
  // Fabric sorts native children by zIndex. Changing it removes/reinserts
  // rows (and their TextureViews), destroying Android Rive surfaces. Android
  // elevation changes draw order without changing native mount order; keep
  // rows/cells materialized even while idle so flattening cannot reparent them.
  movingRow: { position: 'relative', ...Platform.select({ ios: { zIndex: 19 } }), elevation: 19 },
  trapDestinationRow: { position: 'relative', ...Platform.select({ ios: { zIndex: 45 } }), elevation: 45 },
  cell: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  movingCell: { position: 'relative', ...Platform.select({ ios: { zIndex: 20 } }), elevation: 20 },
  trapDestinationCell: { position: 'relative', ...Platform.select({ ios: { zIndex: 46 } }), elevation: 46 },
  availableCell: { backgroundColor: colors.boardMove },
  selectedCell: { backgroundColor: colors.rewardHighlight, borderColor: colors.rewardShadow, borderWidth: 2 },
  piece: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  movingPiece: { ...Platform.select({ ios: { zIndex: 21 } }), elevation: 21 },
  landingPiecePreload: { opacity: 0 },
  combatant: { position: 'absolute', alignItems: 'center', justifyContent: 'center', elevation: 30 },
  combatWinner: { zIndex: 31 },
  combatLoser: { zIndex: 30 },
  trapLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'visible', zIndex: 60, elevation: 60 },
  trapVictim: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'visible', zIndex: 61, elevation: 61 },
  moveArrow: { width: 22, height: 22, resizeMode: 'contain', tintColor: colors.move },
});
