import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { colors, radii, spacing } from '../theme';

interface Props {
  game: GameState;
  playerId: string;
  onPress: () => void;
  width?: number;
}

export function ActiveGameCard({ game, playerId, onPress, width }: Props) {
  const isPlayer1 = game.p1 === playerId;
  const ownOwner = isPlayer1 ? Owner.P1 : Owner.P0;
  const status = gameStatus(game, playerId);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open room ${game.gameId}, ${status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, width ? { width } : undefined, pressed && styles.pressed]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.board}>
        {Array.from({ length: HEIGHT }, (_, displayY) => (
          <View key={displayY} style={styles.boardRow}>
            {Array.from({ length: WIDTH }, (_unused, displayX) => {
              const x = isPlayer1 ? WIDTH - 1 - displayX : displayX;
              const y = isPlayer1 ? HEIGHT - 1 - displayY : displayY;
              const index = toIdx(x, y);
              const owner = game.owners[index] ?? Owner.None;
              const mine = owner === ownOwner;
              return (
                <View key={displayX} style={[styles.cell, (displayX + displayY) % 2 === 0 && styles.alternateCell]}>
                  {owner !== Owner.None && (
                    <View style={[styles.miniPiece, mine ? styles.myPiece : styles.opponentPiece]}>
                      {mine && <Text allowFontScaling={false} style={styles.pieceLabel}>{pieceSymbol(game.pieces[index] ?? Piece.Empty)}</Text>}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.details}>
        <Text maxFontSizeMultiplier={1.8} style={styles.room}>ROOM {game.gameId.toUpperCase()}</Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.status}>{status}</Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.meta}>
          {game.p1 ? `${ownCount(game, ownOwner)} pieces · 2 players` : `${ownCount(game, ownOwner)} pieces · waiting for player`}
        </Text>
      </View>
      <Text accessibilityElementsHidden maxFontSizeMultiplier={1.5} style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function gameStatus(game: GameState, playerId: string) {
  const isPlayer0 = game.p0 === playerId;
  const isPlayer1 = game.p1 === playerId;
  if (game.phase === Phase.Active) {
    const isMyTurn = (isPlayer0 && !game.isP1Turn) || (isPlayer1 && game.isP1Turn);
    return isMyTurn ? 'Your turn' : "Opponent's turn";
  }
  const lineupSaved = (isPlayer0 && game.phase === Phase.LineupP0Set) ||
    (isPlayer1 && game.phase === Phase.LineupP1Set);
  if (!lineupSaved) return 'Set your lineup';
  if (!game.p1) return 'Waiting for opponent';
  return 'Waiting for opponent lineup';
}

function ownCount(game: GameState, owner: Owner) {
  return game.owners.filter(item => item === owner).length;
}

function pieceSymbol(piece: Piece) {
  if (piece === Piece.Rock) return 'R';
  if (piece === Piece.Paper) return 'P';
  if (piece === Piece.Scissors) return 'S';
  if (piece === Piece.Flag) return 'F';
  if (piece === Piece.Trap) return 'T';
  return '';
}

const styles = StyleSheet.create({
  card: { minHeight: 118, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderTopColor: colors.surfaceHighlight, borderWidth: 2, borderBottomWidth: 5, borderBottomColor: colors.background, borderRadius: radii.card, padding: spacing.md, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4 },
  pressed: { opacity: 0.9, transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  board: { width: 86, height: 86, borderRadius: 14, borderWidth: 2, borderColor: colors.primary, overflow: 'hidden' },
  boardRow: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.boardDark },
  alternateCell: { backgroundColor: colors.boardLight },
  miniPiece: { width: 8, height: 8, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  myPiece: { backgroundColor: colors.primary },
  opponentPiece: { backgroundColor: colors.reward },
  pieceLabel: { color: colors.background, fontSize: 5, fontWeight: '900', lineHeight: 7 },
  details: { flex: 1, gap: spacing.xs },
  room: { color: colors.primaryMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  status: { color: colors.text, fontSize: 17, fontWeight: '900' },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  chevron: { color: colors.reward, fontSize: 30, fontWeight: '900' },
});
