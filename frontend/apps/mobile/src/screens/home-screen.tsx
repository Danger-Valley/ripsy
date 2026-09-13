import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Phase } from '@rps/core';
import { ActiveGameCard } from '../components/active-game-card';
import { PrimaryButton } from '../components/primary-button';
import { StatusBanner } from '../components/status-banner';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { usePushNotifications } from '../hooks/use-push-notifications';
import { formatRoomCodeInput, normalizeRoomCode } from '../invitations';
import type { RootStackParamList } from '../navigation';
import { saveActiveGameId } from '../storage/active-game';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation, route }: Props) {
  const isFocused = useIsFocused();
  const { playerId, sessionToken, isReady, error: identityError } = usePlayerIdentity();
  const game = useNativeRipsyGame(playerId, sessionToken, undefined, isFocused);
  const listActiveGames = game.listGames;
  const isGameConnected = game.isConnected;
  const push = usePushNotifications(sessionToken);
  const { width: windowWidth } = useWindowDimensions();
  const [roomCode, setRoomCode] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeGamePage, setActiveGamePage] = useState(0);
  const hasCheckedRestoredGame = useRef(false);
  const restoredGameId = route.params?.restoreGameId;
  const gamesViewportWidth = Math.min(Math.max(0, windowWidth - spacing.xl * 2), 720);
  const activeGameCardWidth = Math.min(420, Math.max(260, gamesViewportWidth * 0.84));
  const activeGameSnapInterval = activeGameCardWidth + spacing.sm;

  const refreshGames = useCallback(async (showSpinner = false) => {
    if (!isGameConnected) return;
    if (showSpinner) setIsRefreshing(true);
    try {
      await listActiveGames();
    } catch {
      // The hook exposes the request error in the shared status banner.
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  }, [isGameConnected, listActiveGames]);

  useEffect(() => {
    if (!restoredGameId) refreshGames().catch(() => undefined);
    return navigation.addListener('focus', () => { refreshGames().catch(() => undefined); });
  }, [navigation, refreshGames, restoredGameId]);

  useEffect(() => {
    if (!isFocused || !isGameConnected || !restoredGameId || hasCheckedRestoredGame.current) return;
    hasCheckedRestoredGame.current = true;
    listActiveGames()
      .then(games => {
        navigation.setParams({ restoreGameId: undefined });
        const restoredGame = games.find(candidate => candidate.gameId === restoredGameId && candidate.phase < Phase.Finished);
        if (restoredGame) {
          navigation.navigate('Game', { gameId: restoredGame.gameId });
          return;
        }
        saveActiveGameId(null).catch(() => undefined);
      })
      .catch(() => {
        // Stay on Home when freshness cannot be verified. Never open stale state.
      });
  }, [isFocused, isGameConnected, listActiveGames, navigation, restoredGameId]);

  useEffect(() => {
    if (game.gameState) refreshGames().catch(() => undefined);
  }, [game.gameState, refreshGames]);

  useEffect(() => {
    setActiveGamePage(current => Math.min(current, Math.max(0, game.activeGames.length - 1)));
  }, [game.activeGames.length]);

  const updateActiveGamePage = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / activeGameSnapInterval);
    setActiveGamePage(Math.max(0, Math.min(nextPage, game.activeGames.length - 1)));
  };

  const createGame = async () => {
    try {
      const gameId = await game.createGame();
      navigation.navigate('Game', { gameId });
    } catch {
      // The hook exposes a user-facing error banner.
    }
  };

  const joinByCode = () => {
    const gameId = normalizeRoomCode(roomCode);
    if (gameId) navigation.navigate('Game', { gameId });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor={colors.primary} onRefresh={() => { refreshGames(true).catch(() => undefined); }} />}
        automaticallyAdjustKeyboardInsets>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Text maxFontSizeMultiplier={1.6} style={styles.eyebrow}>NATIVE MULTIPLAYER</Text>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.title}>RIPSY</Text>
            <Text maxFontSizeMultiplier={2} style={styles.subtitle}>Arrange your army. Outsmart your opponent. Capture the flag.</Text>
          </View>

          <View style={styles.gamesSection}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.sectionTitle}>Your active games</Text>
              {game.activeGames.length > 0 && (
                <Text accessibilityLabel={`Game ${activeGamePage + 1} of ${game.activeGames.length}`} maxFontSizeMultiplier={2} style={styles.gameCount}>
                  {activeGamePage + 1} / {game.activeGames.length}
                </Text>
              )}
            </View>
            {game.activeGames.length > 0 ? (
              <ScrollView
                accessibilityLabel="Active games"
                contentContainerStyle={[styles.gamesCarouselContent, { paddingRight: Math.max(0, gamesViewportWidth - activeGameCardWidth) }]}
                decelerationRate="fast"
                disableIntervalMomentum
                horizontal
                nestedScrollEnabled
                onMomentumScrollEnd={updateActiveGamePage}
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                snapToInterval={activeGameSnapInterval}
                testID="active-games-carousel">
                {game.activeGames.map(activeGame => (
                  <ActiveGameCard
                    game={activeGame}
                    key={activeGame.gameId}
                    playerId={playerId}
                    width={activeGameCardWidth}
                    onPress={() => navigation.navigate('Game', { gameId: activeGame.gameId })}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyGames}>
                <Text maxFontSizeMultiplier={2} style={styles.emptyGamesText}>No unfinished games yet.</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.sectionTitle}>Start a battle</Text>
            <PrimaryButton
              accessibilityHint="Creates a new room and opens it"
              onPress={() => { createGame().catch(() => undefined); }}
              disabled={!isReady || !game.isConnected}
              busy={game.isBusy}>Create game</PrimaryButton>
            <PrimaryButton
              accessibilityHint="Starts a completely offline battle against the computer"
              variant="secondary"
              onPress={() => navigation.navigate('ComputerGame')}>Play vs computer</PrimaryButton>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dividerRow}>
              <View style={styles.divider} /><Text style={styles.or}>OR JOIN</Text><View style={styles.divider} />
            </View>
            <TextInput
              accessibilityLabel="Room code"
              accessibilityHint="Enter the eight-character code from your invitation"
              autoCapitalize="none"
              autoCorrect={false}
              maxFontSizeMultiplier={2}
              onChangeText={value => setRoomCode(formatRoomCodeInput(value))}
              onSubmitEditing={joinByCode}
              placeholder="8-character room code"
              placeholderTextColor={colors.textMuted}
              returnKeyType="go"
              style={styles.input}
              value={roomCode}
            />
            <PrimaryButton
              accessibilityHint="Joins the entered battle automatically"
              variant="secondary"
              onPress={joinByCode}
              disabled={!normalizeRoomCode(roomCode)}>Join battle</PrimaryButton>
          </View>

          {(identityError || game.error) ? <StatusBanner message={identityError || game.error || ''} tone="error" /> : (
            <StatusBanner message={game.isConnected ? 'Connected to the game server' : `Server: ${game.status}`} tone={game.isConnected ? 'success' : 'neutral'} />
          )}
          {(push.status === 'prompt' || push.status === 'denied' || push.status === 'error') && (
            <View style={styles.notificationCard}>
              <Text maxFontSizeMultiplier={2} style={styles.notificationText}>
                {push.status === 'denied' ? 'Notifications are disabled in system settings.' : 'Get notified when your opponent moves.'}
              </Text>
              {push.status !== 'denied' && (
                <PrimaryButton variant="secondary" disabled={!isReady} onPress={() => { push.enable().catch(() => undefined); }}>
                  Enable notifications
                </PrimaryButton>
              )}
            </View>
          )}
          <Text accessibilityLabel={playerId ? `Player identifier ${playerId}` : 'Player identifier initializing'} maxFontSizeMultiplier={2} style={styles.identity}>
            Player {playerId ? `${playerId.slice(0, 12)}…` : 'initializing…'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, padding: spacing.xl, paddingVertical: spacing.xxl },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  eyebrow: { color: colors.primaryMuted, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.primary, fontSize: 52, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 23, maxWidth: 360, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: spacing.xs },
  gamesSection: { gap: spacing.sm },
  gamesCarouselContent: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gameCount: { minWidth: 26, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surfaceStrong, color: colors.primary, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  emptyGames: { borderColor: colors.border, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: spacing.lg },
  emptyGamesText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  divider: { backgroundColor: colors.border, height: 1, flex: 1 },
  or: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { minHeight: 50, color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, fontSize: 17, paddingHorizontal: spacing.lg, textAlign: 'center', letterSpacing: 2 },
  identity: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  notificationCard: { gap: spacing.sm },
  notificationText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
