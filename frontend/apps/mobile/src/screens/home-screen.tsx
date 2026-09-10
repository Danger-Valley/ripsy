import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../components/primary-button';
import { StatusBanner } from '../components/status-banner';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import type { RootStackParamList } from '../navigation';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { playerId, isReady } = usePlayerIdentity();
  const game = useNativeRipsyGame(playerId);
  const [roomCode, setRoomCode] = useState('');

  const createGame = async () => {
    try {
      const gameId = await game.createGame();
      navigation.navigate('Game', { gameId });
    } catch {
      // The hook exposes a user-facing error banner.
    }
  };

  const joinByCode = () => {
    const gameId = roomCode.trim().toLowerCase();
    if (gameId) navigation.navigate('Game', { gameId });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>NATIVE MULTIPLAYER</Text>
        <Text style={styles.title}>RIPSY</Text>
        <Text style={styles.subtitle}>Arrange your army. Outsmart your opponent. Capture the flag.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Start a battle</Text>
        <PrimaryButton onPress={() => { createGame().catch(() => undefined); }} disabled={!isReady || !game.isConnected} busy={game.isBusy}>Create game</PrimaryButton>
        <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.or}>OR JOIN</Text><View style={styles.divider} /></View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={8}
          onChangeText={setRoomCode}
          onSubmitEditing={joinByCode}
          placeholder="8-character room code"
          placeholderTextColor={colors.textMuted}
          returnKeyType="go"
          style={styles.input}
          value={roomCode}
        />
        <PrimaryButton variant="secondary" onPress={joinByCode} disabled={roomCode.trim().length !== 8}>Open room</PrimaryButton>
      </View>

      {game.error ? <StatusBanner message={game.error} tone="error" /> : (
        <StatusBanner message={game.isConnected ? 'Connected to the game server' : `Server: ${game.status}`} tone={game.isConnected ? 'success' : 'neutral'} />
      )}
      <Text style={styles.identity}>Player {playerId ? `${playerId.slice(0, 12)}…` : 'initializing…'}</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  eyebrow: { color: colors.primaryMuted, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.primary, fontSize: 52, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 23, maxWidth: 360, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: spacing.xs },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  divider: { backgroundColor: colors.border, height: 1, flex: 1 },
  or: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { minHeight: 50, color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, fontSize: 17, paddingHorizontal: spacing.lg, textAlign: 'center', letterSpacing: 2 },
  identity: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
});
