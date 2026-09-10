import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HEIGHT, Owner, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { colors } from '../theme';

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
  onCellPress?: (coordinate: Coordinate) => void;
}

export function GameBoard({ state, ownOwner, isPlayer1, previewLineup, selected, availableMoves = [], onCellPress }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 32, 560);
  const cellSize = boardSize / WIDTH;
  const preview = useMemo(() => new Map(previewLineup?.map(item => [toIdx(item.x, item.y), item.piece])), [previewLineup]);

  return (
    <View accessibilityLabel="RIPSY game board" style={[styles.board, { width: boardSize, height: boardSize }]}>
      {Array.from({ length: HEIGHT }, (_, displayY) => (
        <View key={displayY} style={styles.row}>
          {Array.from({ length: WIDTH }, (_unused, displayX) => {
            const x = isPlayer1 ? WIDTH - 1 - displayX : displayX;
            const y = isPlayer1 ? HEIGHT - 1 - displayY : displayY;
            const index = toIdx(x, y);
            const owner = state?.owners[index] ?? (preview.has(index) ? ownOwner : Owner.None);
            const piece = preview.get(index) ?? state?.pieces[index] ?? Piece.Empty;
            const isMine = owner === ownOwner && ownOwner !== Owner.None;
            const isSelected = selected?.x === x && selected.y === y;
            const isAvailable = availableMoves.some(move => move.x === x && move.y === y);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Board cell ${displayX + 1}, ${displayY + 1}${owner === Owner.None ? ', empty' : `, ${isMine ? 'your' : 'opponent'} piece`}`}
                key={displayX}
                onPress={() => onCellPress?.({ x, y })}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  (displayX + displayY) % 2 === 0 && styles.alternateCell,
                  isAvailable && styles.availableCell,
                  isSelected && styles.selectedCell,
                ]}>
                {owner !== Owner.None ? (
                  <View style={[styles.piece, isMine ? styles.myPiece : styles.opponentPiece, { width: cellSize * 0.68, height: cellSize * 0.68 }]}>
                    <Text style={[styles.pieceLabel, { fontSize: Math.max(12, cellSize * 0.28) }]}>{isMine ? pieceLabel(piece) : '?'}</Text>
                  </View>
                ) : isAvailable ? <View style={styles.moveDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function pieceLabel(piece: Piece) {
  if (piece === Piece.Rock) return 'R';
  if (piece === Piece.Paper) return 'P';
  if (piece === Piece.Scissors) return 'S';
  if (piece === Piece.Flag) return 'F';
  if (piece === Piece.Trap) return 'T';
  return '•';
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', borderColor: colors.primaryMuted, borderWidth: 2, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#142029', borderColor: '#243641', borderWidth: StyleSheet.hairlineWidth },
  alternateCell: { backgroundColor: '#182731' },
  availableCell: { backgroundColor: '#12384A' },
  selectedCell: { backgroundColor: '#245D5A', borderColor: colors.primary, borderWidth: 2 },
  piece: { borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  myPiece: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  opponentPiece: { backgroundColor: '#5B3540', borderColor: '#FB7185' },
  pieceLabel: { color: colors.text, fontWeight: '900' },
  moveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.move },
});
