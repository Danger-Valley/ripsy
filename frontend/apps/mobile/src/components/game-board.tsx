import { useMemo } from 'react';
import { Animated, Image, Pressable, StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { useRiveFile, type RiveFile } from '@rive-app/react-native';
import { HEIGHT, isMovablePiece, Owner, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { haptics } from '../haptics';
import { colors } from '../theme';
import type { CombatAnimation, CombatAnimationPhase, PieceMoveAnimation } from '../game-animation';
import { RiveGamePiece, type RiveActionTrigger } from './rive-game-piece';

const figureAsset = require('../assets/figures/fig1.riv');
const boardBorderWidth = 2;
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
}

interface Coordinate {
  x: number;
  y: number;
}

interface Props {
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
  showOpponentFormation?: boolean;
  onCellPress?: (coordinate: Coordinate) => void;
}

export function GameBoard({ state, ownOwner, isPlayer1, previewLineup, selected, availableMoves = [], interactionEnabled = false, combatAnimation, combatPhase, moveAnimation, moveProgress, showOpponentFormation = false, onCellPress }: Props) {
  const { width } = useWindowDimensions();
  const { riveFile } = useRiveFile(figureAsset);
  const boardSize = Math.min(width - 32, 600);
  const cellSize = (boardSize - boardBorderWidth * 2) / WIDTH;
  const preview = useMemo(() => new Map(previewLineup?.map(item => [toIdx(item.x, item.y), item.piece])), [previewLineup]);
  const movingDisplayFrom = moveAnimation ? toDisplayCoordinate(moveAnimation.from, isPlayer1) : null;

  return (
    <View accessible={false} style={[styles.board, { width: boardSize, height: boardSize }]} testID="game-board">
      <View pointerEvents="none" style={styles.grid} testID="board-grid">
        {Array.from({ length: HEIGHT }, (_, displayY) => (
          <View key={displayY} style={styles.gridRow}>
            {Array.from({ length: WIDTH }, (_unused, displayX) => (
              <View
                key={displayX}
                style={[
                  styles.gridCell,
                  { width: cellSize, height: cellSize },
                  (displayX + displayY) % 2 === 0 && styles.alternateGridCell,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      {Array.from({ length: HEIGHT }, (_, displayY) => (
        <View
          key={displayY}
          style={[styles.row, movingDisplayFrom?.y === displayY && styles.movingRow]}
          testID={movingDisplayFrom?.y === displayY ? 'moving-source-row' : undefined}>
          {Array.from({ length: WIDTH }, (_unused, displayX) => {
            const x = isPlayer1 ? WIDTH - 1 - displayX : displayX;
            const y = isPlayer1 ? HEIGHT - 1 - displayY : displayY;
            const index = toIdx(x, y);
            const previewPiece = preview.get(index);
            const serverOwner = state?.owners[index] ?? Owner.None;
            const isOpponentPreview = Boolean(showOpponentFormation && displayY < 2 && previewPiece === undefined && serverOwner === Owner.None);
            const owner = previewPiece !== undefined
              ? ownOwner
              : isOpponentPreview ? opponentOf(ownOwner) : serverOwner;
            const piece = previewPiece ?? state?.pieces[index] ?? Piece.Empty;
            const isMine = owner === ownOwner && ownOwner !== Owner.None;
            const isMovingSource = moveAnimation?.from.x === x && moveAnimation.from.y === y;
            const isCombatant = Boolean(combatAnimation && (
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
            return (
              <Pressable
                accessibilityRole={isActionable ? 'button' : 'text'}
                accessibilityLabel={`Row ${displayY + 1}, column ${displayX + 1}, ${occupant}`}
                accessibilityHint={hint}
                accessibilityState={{ disabled: !isActionable, selected: isSelected }}
                disabled={!isActionable}
                key={displayX}
                onPress={() => {
                  if (!isAvailable) haptics.select();
                  onCellPress?.({ x, y });
                }}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  isAvailable && styles.availableCell,
                  isSelected && styles.selectedCell,
                  isMovingSource && styles.movingCell,
                ]}>
                {owner !== Owner.None && !isCombatant ? (
                  <Animated.View
                    pointerEvents="none"
                    testID="piece-visual"
                    style={[
                      styles.piece,
                      isMovingSource && styles.movingPiece,
                      {
                        width: cellSize * 0.88,
                        height: cellSize * 0.88,
                        transform: isMovingSource && moveAnimation && moveProgress
                          ? movingPieceTransform(cellSize, isPlayer1, moveAnimation, moveProgress)
                          : [{ translateY: -cellSize * (isOpponentPreview ? 0.34 : 0.43) }],
                      },
                    ]}>
                    {riveFile ? (
                      <RiveGamePiece
                        actionTrigger={isMovingSource && moveAnimation
                          ? jumpTriggerForMove(moveAnimation, isPlayer1)
                          : undefined}
                        file={riveFile}
                        isMine={isMine}
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
      {combatAnimation && combatPhase && moveProgress && riveFile ? (
        <CombatScene
          cellSize={cellSize}
          combat={combatAnimation}
          isPlayer1={isPlayer1}
          ownOwner={ownOwner}
          phase={combatPhase}
          progress={moveProgress}
          riveFile={riveFile}
        />
      ) : null}
    </View>
  );
}

function CombatScene({ cellSize, combat, isPlayer1, ownOwner, phase, progress, riveFile }: {
  cellSize: number;
  combat: CombatAnimation;
  isPlayer1: boolean;
  ownOwner: Owner;
  phase: CombatAnimationPhase;
  progress: Animated.Value;
  riveFile: RiveFile;
}) {
  const attacker = toDisplayCoordinate(combat.from, isPlayer1);
  const defender = toDisplayCoordinate(combat.to, isPlayer1);
  const attackerOnLeft = attacker.x <= defender.x;
  return (
    <>
      <Combatant
        cellSize={cellSize}
        faceRight={attackerOnLeft}
        isMine={combat.attackerOwner === ownOwner}
        isWinner={combat.winnerOwner === combat.attackerOwner}
        phase={phase}
        piece={combat.attackerPiece}
        position={attacker}
        progress={progress}
        riveFile={riveFile}
        target={defender}
        targetSide={attackerOnLeft ? -1 : 1}
      />
      <Combatant
        cellSize={cellSize}
        faceRight={!attackerOnLeft}
        isMine={combat.defenderOwner === ownOwner}
        isWinner={combat.winnerOwner === combat.defenderOwner}
        phase={phase}
        piece={combat.defenderPiece}
        position={defender}
        progress={progress}
        riveFile={riveFile}
        target={attacker}
        targetSide={attackerOnLeft ? 1 : -1}
      />
    </>
  );
}

function Combatant({ cellSize, faceRight, isMine, isWinner, phase, piece, position, progress, riveFile, target, targetSide }: {
  cellSize: number;
  faceRight: boolean;
  isMine: boolean;
  isWinner: boolean;
  phase: CombatAnimationPhase;
  piece: Piece;
  position: Coordinate;
  progress: Animated.Value;
  riveFile: RiveFile;
  target: Coordinate;
  targetSide: -1 | 1;
}) {
  const centerX = ((position.x + target.x + 1) / 2) * cellSize;
  const centerY = ((position.y + target.y + 1) / 2) * cellSize;
  const finalLeft = centerX + targetSide * cellSize * 0.24 - cellSize / 2;
  const finalTop = centerY - cellSize / 2;
  const startLeft = position.x * cellSize;
  const startTop = position.y * cellSize;
  const translateX = progress.interpolate({ inputRange: [0, 0.25, 1, 4], outputRange: [0, 0, finalLeft - startLeft, finalLeft - startLeft], extrapolate: 'clamp' });
  const translateY = progress.interpolate({ inputRange: [0, 0.25, 1, 4], outputRange: [0, 0, finalTop - startTop, finalTop - startTop], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0, 1, 1.35, 3, 4], outputRange: [1, 1, 2, 2, 1], extrapolate: 'clamp' });
  const opacity = progress.interpolate({
    inputRange: [0, 2, 3, 4],
    outputRange: isWinner ? [1, 1, 1, 0] : [1, 1, 0, 0],
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
          transform: [{ translateX }, { translateY }, { scale }, { scaleX: faceRight ? 1 : -1 }],
          width: cellSize,
        },
        isWinner ? styles.combatWinner : styles.combatLoser,
      ]}
      testID={isWinner ? 'combat-winner' : 'combat-loser'}>
      <View style={[styles.piece, { width: cellSize * 0.88, height: cellSize * 0.88, transform: [{ translateY: -cellSize * 0.43 }] }]}>
        <RiveGamePiece actionTrigger={trigger} file={riveFile} isMine={isMine} piece={piece} size={cellSize * 1.68} />
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
  board: { alignSelf: 'center', backgroundColor: '#142029', borderColor: colors.primaryMuted, borderWidth: boardBorderWidth, borderRadius: 10, overflow: 'visible' },
  grid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  gridRow: { flexDirection: 'row' },
  gridCell: { backgroundColor: '#142029', borderColor: '#243641', borderWidth: StyleSheet.hairlineWidth },
  alternateGridCell: { backgroundColor: '#182731' },
  row: { flexDirection: 'row', overflow: 'visible' },
  movingRow: { position: 'relative', zIndex: 19, elevation: 19 },
  cell: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  movingCell: { position: 'relative', zIndex: 20, elevation: 20 },
  availableCell: { backgroundColor: '#12384A' },
  selectedCell: { backgroundColor: '#245D5A', borderColor: colors.primary, borderWidth: 2 },
  piece: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  movingPiece: { zIndex: 21, elevation: 21 },
  combatant: { position: 'absolute', alignItems: 'center', justifyContent: 'center', elevation: 30 },
  combatWinner: { zIndex: 31 },
  combatLoser: { zIndex: 30 },
  moveArrow: { width: 22, height: 22, resizeMode: 'contain', tintColor: colors.move },
});
