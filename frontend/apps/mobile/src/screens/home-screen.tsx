import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Phase } from '@rps/core';
import { ActiveGameCard } from '../components/active-game-card';
import { PrimaryButton } from '../components/primary-button';
import { SolanaWalletCard } from '../components/solana-wallet-card';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { usePushNotifications } from '../hooks/use-push-notifications';
import { formatRoomCodeInput, normalizeRoomCode } from '../invitations';
import type { RootStackParamList } from '../navigation';
import { saveActiveGameId } from '../storage/active-game';
import { colors, radii, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation, route }: Props) {
  const isFocused = useIsFocused();
  const { playerId, sessionToken, isReady } = usePlayerIdentity();
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
      <View pointerEvents="none" style={styles.backgroundOrbTop} />
      <View pointerEvents="none" style={styles.backgroundOrbBottom} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor={colors.primary} onRefresh={() => { refreshGames(true).catch(() => undefined); }} />}
        automaticallyAdjustKeyboardInsets>
        <View style={styles.container}>
          <View testID="arcade-home-hero" style={styles.hero}>
            <View style={styles.heroTopline}>
              <Text maxFontSizeMultiplier={1.6} style={styles.eyebrow}>RIPSY ARCADE</Text>
              <View style={styles.seasonPill}>
                <View style={styles.seasonDot} />
                <Text style={styles.seasonText}>BATTLE READY</Text>
              </View>
            </View>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.title}>RIPSY</Text>
            <Text maxFontSizeMultiplier={2} style={styles.subtitle}>Build a sneaky army. Win the clash. Steal the flag.</Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.heroChips}>
              <View style={styles.heroChip}><Text style={styles.heroChipText}>HIDDEN LINEUPS</Text></View>
              <View style={styles.heroChip}><Text style={styles.heroChipText}>FAST BATTLES</Text></View>
            </View>
          </View>

          {Platform.OS === 'android' && <SolanaWalletCard />}

          <View style={styles.gamesSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>KEEP THE STREAK ALIVE</Text>
                <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.sectionTitle}>Your active games</Text>
              </View>
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
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.emptyBadge}>
                  <Text style={styles.emptyBadgeText}>0</Text>
                </View>
                <View style={styles.emptyCopy}>
                  <Text maxFontSizeMultiplier={2} style={styles.emptyGamesTitle}>No battles in progress</Text>
                  <Text maxFontSizeMultiplier={2} style={styles.emptyGamesText}>Your next rivalry starts below.</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.playCard}>
            <View style={styles.playCardHeader}>
              <View style={styles.playIcon}><Text style={styles.playIconText}>VS</Text></View>
              <View style={styles.playCopy}>
                <Text style={styles.eyebrow}>CHOOSE YOUR MATCH</Text>
                <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.sectionTitle}>Start a battle</Text>
              </View>
            </View>
            <PrimaryButton
              accessibilityHint="Creates a new room and opens it"
              onPress={() => { createGame().catch(() => undefined); }}
              disabled={!isReady || !game.isConnected}
              busy={game.isBusy}>Create online battle</PrimaryButton>
            <PrimaryButton
              accessibilityHint="Starts a completely offline battle against the computer"
              variant="secondary"
              onPress={() => navigation.navigate('ComputerGame')}>Play vs computer</PrimaryButton>
          </View>

          <View style={styles.joinCard}>
            <Text style={styles.eyebrow}>GOT AN INVITE?</Text>
            <Text style={styles.joinTitle}>Jump into a friend's room</Text>
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

          <View style={styles.collectionCard}>
            <View style={styles.collectionHeader}>
              <View style={styles.collectionIcon}>
                <View style={styles.collectionHead} />
                <View style={styles.collectionBody} />
              </View>
              <View style={styles.collectionCopy}>
                <Text style={styles.eyebrow}>YOUR FIGHTERS</Text>
                <Text style={styles.sectionTitle}>Build a lineup with attitude.</Text>
              </View>
            </View>
            <PrimaryButton onPress={() => navigation.navigate('Army')}>Set up your army</PrimaryButton>
            <PrimaryButton variant="secondary" onPress={() => navigation.navigate('Shop')}>Explore figure shop</PrimaryButton>
          </View>

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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backgroundOrbTop: { position: 'absolute', top: -92, right: -72, width: 220, height: 220, borderRadius: 110, backgroundColor: colors.surfaceHighlight, opacity: 0.52 },
  backgroundOrbBottom: { position: 'absolute', bottom: 90, left: -120, width: 260, height: 260, borderRadius: 130, backgroundColor: colors.primaryShadow, opacity: 0.18 },
  scrollContent: { flexGrow: 1, padding: spacing.xl, paddingVertical: spacing.xxl },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.xl },
  hero: { backgroundColor: colors.surface, borderColor: colors.border, borderTopColor: colors.surfaceHighlight, borderWidth: 2, borderBottomColor: colors.background, borderBottomWidth: 7, borderRadius: radii.panel, padding: spacing.xl, gap: spacing.sm, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 6 },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  eyebrow: { color: colors.primaryMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.7 },
  seasonPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.backgroundRaised, borderColor: colors.border, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  seasonDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  seasonText: { color: colors.text, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.primary, fontSize: 56, lineHeight: 60, fontWeight: '900', letterSpacing: 3, textShadowColor: colors.primaryShadow, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24, maxWidth: 390 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  heroChip: { backgroundColor: colors.surfaceStrong, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  heroChipText: { color: colors.reward, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: spacing.xs },
  gamesSection: { gap: spacing.md },
  gamesCarouselContent: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  gameCount: { minWidth: 54, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.reward, color: colors.background, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  emptyGames: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 2, borderStyle: 'dashed', borderRadius: radii.card, padding: spacing.lg },
  emptyBadge: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong, borderColor: colors.border, borderWidth: 2 },
  emptyBadgeText: { color: colors.reward, fontSize: 22, fontWeight: '900' },
  emptyCopy: { flex: 1, gap: 3 },
  emptyGamesTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  emptyGamesText: { color: colors.textMuted, fontSize: 13 },
  playCard: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 2, borderTopColor: colors.primaryHighlight, borderBottomColor: colors.primaryShadow, borderBottomWidth: 7, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.md, shadowColor: colors.primaryShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 6 },
  playCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  playIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.reward, borderColor: colors.rewardHighlight, borderTopWidth: 2, borderBottomColor: colors.rewardShadow, borderBottomWidth: 5, transform: [{ rotate: '-4deg' }] },
  playIconText: { color: colors.background, fontSize: 18, fontWeight: '900' },
  playCopy: { flex: 1 },
  joinCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 2, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  joinTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  input: { minHeight: 56, color: colors.text, backgroundColor: colors.backgroundRaised, borderColor: colors.border, borderWidth: 2, borderRadius: radii.control, fontSize: 17, fontWeight: '800', paddingHorizontal: spacing.lg, textAlign: 'center', letterSpacing: 2 },
  collectionCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 2, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  collectionIcon: { width: 56, height: 62, alignItems: 'center', justifyContent: 'flex-end' },
  collectionHead: { position: 'absolute', top: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, borderColor: colors.primaryHighlight, borderWidth: 2 },
  collectionBody: { width: 48, height: 32, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: colors.surfaceHighlight, borderColor: colors.primaryMuted, borderWidth: 2 },
  collectionCopy: { flex: 1 },
  notificationCard: { gap: spacing.sm },
  notificationText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
