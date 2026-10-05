import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Phase, type GameState } from '@rps/core';
import { homeArt, homeFont } from './toy-home-controls';

interface Props {
  game: GameState;
  playerId: string;
  onPress: () => void;
  width?: number;
}

export function ActiveGameCard({ game, playerId, onPress, width }: Props) {
  const status = gameStatus(game, playerId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open room ${game.gameId}, ${status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, width ? { width } : undefined, pressed && styles.pressed]}>
      <Image accessibilityElementsHidden source={homeArt.swords} resizeMode="contain" style={styles.icon} />
      <View style={styles.details}>
        <Text maxFontSizeMultiplier={1.6} numberOfLines={1} style={styles.title}>Battle {game.gameId}</Text>
        <View style={styles.statusChip}>
          <Text maxFontSizeMultiplier={1.6} numberOfLines={2} style={styles.status}>{status}</Text>
        </View>
      </View>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
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

const styles = StyleSheet.create({
  card: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F2F8F7', borderWidth: 1, borderColor: '#B9D4DD', borderRadius: 13, padding: 8 },
  pressed: { backgroundColor: '#DCF1F7', transform: [{ translateY: 1 }] },
  icon: { width: 43, height: 43 },
  details: { flex: 1, gap: 4 },
  title: { color: '#07345C', fontFamily: homeFont, fontSize: 15, fontWeight: '900' },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FFDA33', borderColor: '#FFC00A', borderWidth: 1, borderRadius: 7 },
  status: { color: '#07345C', fontFamily: homeFont, fontSize: 11, fontWeight: '800' },
  chevron: { color: '#088DBB', fontSize: 28, fontWeight: '900' },
});
