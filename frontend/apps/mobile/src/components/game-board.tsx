import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { useRiveFile } from '@rive-app/react-native';
import { HEIGHT, Owner, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { haptics } from '../haptics';
import { colors } from '../theme';
import { RiveGamePiece } from './rive-game-piece';

const figureAsset = require('../assets/figures/fig1.riv');
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
  showOpponentFormation?: boolean;
  onCellPress?: (coordinate: Coordinate) => void;
}

export function GameBoard({ state, ownOwner, isPlayer1, previewLineup, selected, availableMoves = [], interactionEnabled = false, showOpponentFormation = false, onCellPress }: Props) {
  const { width } = useWindowDimensions();
  const { riveFile } = useRiveFile(figureAsset);
  const boardSize = Math.min(width - 32, 600);
  const cellSize = boardSize / WIDTH;
  const preview = useMemo(() => new Map(previewLineup?.map(item => [toIdx(item.x, item.y), item.piece])), [previewLineup]);

  return (
    <View accessible={false} style={[styles.board, { width: boardSize, height: boardSize }]} testID="game-board">
      {Array.from({ length: HEIGHT }, (_, displayY) => (
        <View key={displayY} style={styles.row}>
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
            const isSelected = selected?.x === x && selected.y === y;
            const isAvailable = availableMoves.some(move => move.x === x && move.y === y);
            const isActionable = Boolean(interactionEnabled && onCellPress && (selected ? isMine || isAvailable : isMine));
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
                  (displayX + displayY) % 2 === 0 && styles.alternateCell,
                  isAvailable && styles.availableCell,
                  isSelected && styles.selectedCell,
                ]}>
                {owner !== Owner.None ? (
                  <View
                    pointerEvents="none"
                    testID="piece-visual"
                    style={[
                      styles.piece,
                      {
                        width: cellSize * 0.88,
                        height: cellSize * 0.88,
                        transform: [{ translateY: -cellSize * (isOpponentPreview ? 0.34 : 0.43) }],
                      },
                    ]}>
                    {riveFile ? (
                      <RiveGamePiece
                        file={riveFile}
                        isMine={isMine}
                        piece={piece}
                        size={cellSize * 1.68}
                        staggerStart={isOpponentPreview}
                      />
                    ) : null}
                  </View>
                ) : isAvailable && selected ? (
                  <Image source={moveArrowSource(selected, { x, y }, isPlayer1)} style={styles.moveArrow} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
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
  board: { alignSelf: 'center', borderColor: colors.primaryMuted, borderWidth: 2, borderRadius: 10, overflow: 'visible' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#142029', borderColor: '#243641', borderWidth: StyleSheet.hairlineWidth },
  alternateCell: { backgroundColor: '#182731' },
  availableCell: { backgroundColor: '#12384A' },
  selectedCell: { backgroundColor: '#245D5A', borderColor: colors.primary, borderWidth: 2 },
  piece: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  moveArrow: { width: 22, height: 22, resizeMode: 'contain', tintColor: colors.move },
});
