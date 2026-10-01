import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { haptics } from '../haptics';
import { colors, radii, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const heroFigure1 = require('../assets/shop/fig1.png');
const heroFigure2 = require('../assets/shop/fig2.png');

export function HomeScreen({ navigation, route }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
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
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(spacing.xxl, insets.top + spacing.lg),
            paddingBottom: Math.max(spacing.xxl, insets.bottom + spacing.xl),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor={colors.primary} onRefresh={() => { refreshGames(true).catch(() => undefined); }} />}
        automaticallyAdjustKeyboardInsets
        testID="home-scroll">
        <View style={styles.container}>
          <View testID="arcade-home-hero" style={styles.hero}>
            <View pointerEvents="none" style={styles.heroBubbleOne} />
            <View pointerEvents="none" style={styles.heroBubbleTwo} />
            <Text maxFontSizeMultiplier={1.6} style={styles.heroEyebrow}>RIPSY ARCADE</Text>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.title}>RIPSY</Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fighterStage}>
              <View style={[styles.fighterBubble, styles.fighterBubblePink]}>
                <Image source={heroFigure1} style={styles.heroFighter} />
              </View>
              <View style={styles.vsBadge}>
                <Text style={styles.vsText}>VS</Text>
              </View>
              <View style={[styles.fighterBubble, styles.fighterBubbleBlue]}>
                <Image source={heroFigure2} style={styles.heroFighter} />
              </View>
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.subtitle}>Build your army. Outsmart your rival. Grab the flag!</Text>
          </View>

          {Platform.OS === 'android' && <SolanaWalletCard />}

          <View style={styles.gamesSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrowOnCanvas}>KEEP THE STREAK ALIVE</Text>
                <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.sectionTitleOnCanvas}>Your active games</Text>
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
              variant="reward"
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
              placeholderTextColor={colors.kitPanelMuted}
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
            <View style={styles.collectionActions}>
              <MenuTile label="YOUR ARMY" symbol="♟" tone="pink" onPress={() => navigation.navigate('Army')} />
              <MenuTile label="FIGURE SHOP" symbol="★" tone="cyan" onPress={() => navigation.navigate('Shop')} />
            </View>
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

function MenuTile({ label, symbol, tone, onPress }: { label: string; symbol: string; tone: 'pink' | 'cyan'; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === 'YOUR ARMY' ? 'Set up your army' : 'Explore figure shop'}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [styles.menuTile, tone === 'pink' ? styles.menuTilePink : styles.menuTileCyan, pressed && styles.menuTilePressed]}>
      <View style={styles.menuTileIcon}><Text style={styles.menuTileSymbol}>{symbol}</Text></View>
      <Text style={styles.menuTileLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backgroundOrbTop: { position: 'absolute', top: -80, right: -70, width: 230, height: 230, borderRadius: 115, backgroundColor: colors.primary, opacity: 0.32 },
  backgroundOrbBottom: { position: 'absolute', bottom: 70, left: -120, width: 280, height: 280, borderRadius: 140, backgroundColor: colors.accent, opacity: 0.18 },
  scrollContent: { flexGrow: 1, padding: spacing.xl, paddingVertical: spacing.xxl },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.xl },
  hero: { position: 'relative', alignItems: 'center', overflow: 'hidden', backgroundColor: colors.surfaceHighlight, borderTopColor: colors.primaryMuted, borderTopWidth: 3, borderBottomColor: colors.shadow, borderBottomWidth: 8, borderRadius: radii.panel, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.32, shadowRadius: 18, elevation: 8 },
  heroBubbleOne: { position: 'absolute', top: -25, left: -20, width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, opacity: 0.32 },
  heroBubbleTwo: { position: 'absolute', right: -18, bottom: -28, width: 112, height: 112, borderRadius: 56, backgroundColor: colors.accent, opacity: 0.25 },
  eyebrow: { color: colors.primaryShadow, fontSize: 11, fontWeight: '900', letterSpacing: 1.7 },
  eyebrowOnCanvas: { color: colors.rewardHighlight, fontSize: 11, fontWeight: '900', letterSpacing: 1.7 },
  heroEyebrow: { color: colors.rewardHighlight, fontSize: 11, fontWeight: '900', letterSpacing: 2.2 },
  title: { color: colors.reward, fontSize: 52, lineHeight: 56, fontWeight: '900', letterSpacing: 3, textShadowColor: colors.shadow, textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 0 },
  subtitle: { color: colors.text, fontSize: 16, fontWeight: '800', lineHeight: 22, maxWidth: 360, textAlign: 'center' },
  fighterStage: { height: 118, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xs },
  fighterBubble: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'flex-end', borderTopWidth: 4, borderBottomWidth: 7, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  fighterBubblePink: { backgroundColor: colors.primary, borderTopColor: colors.primaryHighlight, borderBottomColor: colors.primaryShadow, transform: [{ rotate: '-4deg' }] },
  fighterBubbleBlue: { backgroundColor: colors.accent, borderTopColor: colors.accentHighlight, borderBottomColor: colors.accentShadow, transform: [{ rotate: '4deg' }] },
  heroFighter: { width: 98, height: 106, resizeMode: 'contain' },
  vsBadge: { zIndex: 2, width: 58, height: 58, borderRadius: 20, marginHorizontal: -8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.reward, borderTopColor: colors.rewardHighlight, borderTopWidth: 3, borderBottomColor: colors.rewardShadow, borderBottomWidth: 6, transform: [{ rotate: '-8deg' }], shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  vsText: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  sectionTitle: { color: colors.kitPanelInk, fontSize: 22, fontWeight: '900', marginTop: spacing.xs },
  sectionTitleOnCanvas: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: spacing.xs },
  gamesSection: { gap: spacing.md },
  gamesCarouselContent: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  gameCount: { minWidth: 54, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.reward, color: colors.ink, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  emptyGames: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.kitPanel, borderTopColor: colors.kitPanelBorder, borderTopWidth: 2, borderBottomColor: colors.kitPanelShadow, borderBottomWidth: 6, borderRadius: radii.card, padding: spacing.lg, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  emptyBadge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderTopColor: colors.primaryHighlight, borderTopWidth: 3, borderBottomColor: colors.primaryShadow, borderBottomWidth: 5 },
  emptyBadgeText: { color: colors.text, fontSize: 22, fontWeight: '900' },
  emptyCopy: { flex: 1, gap: 3 },
  emptyGamesTitle: { color: colors.kitPanelInk, fontSize: 15, fontWeight: '900' },
  emptyGamesText: { color: colors.kitPanelMuted, fontSize: 13 },
  playCard: { backgroundColor: colors.kitPanel, borderTopColor: colors.kitPanelBorder, borderTopWidth: 3, borderBottomColor: colors.kitPanelShadow, borderBottomWidth: 8, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.md, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 6 },
  playCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  playIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.reward, borderColor: colors.rewardHighlight, borderTopWidth: 2, borderBottomColor: colors.rewardShadow, borderBottomWidth: 5, transform: [{ rotate: '-4deg' }] },
  playIconText: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  playCopy: { flex: 1 },
  joinCard: { backgroundColor: colors.kitPanel, borderTopColor: colors.kitPanelBorder, borderTopWidth: 2, borderBottomColor: colors.kitPanelShadow, borderBottomWidth: 6, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  joinTitle: { color: colors.kitPanelInk, fontSize: 18, fontWeight: '900' },
  input: { minHeight: 58, color: colors.kitPanelInk, backgroundColor: colors.kitPanelSoft, borderColor: colors.kitPanelBorder, borderWidth: 2, borderRadius: radii.control, fontSize: 17, fontWeight: '800', paddingHorizontal: spacing.lg, textAlign: 'center', letterSpacing: 2 },
  collectionCard: { backgroundColor: colors.kitPanel, borderTopColor: colors.kitPanelBorder, borderTopWidth: 2, borderBottomColor: colors.kitPanelShadow, borderBottomWidth: 7, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  collectionIcon: { width: 56, height: 62, alignItems: 'center', justifyContent: 'flex-end' },
  collectionHead: { position: 'absolute', top: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, borderColor: colors.primaryHighlight, borderWidth: 2 },
  collectionBody: { width: 48, height: 32, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: colors.kitPanelSoft, borderColor: colors.primaryMuted, borderWidth: 2 },
  collectionCopy: { flex: 1 },
  collectionActions: { flexDirection: 'row', gap: spacing.md },
  menuTile: { flex: 1, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 22, borderTopWidth: 3, borderBottomWidth: 7, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 7, elevation: 4 },
  menuTilePink: { backgroundColor: colors.kitPink, borderTopColor: colors.kitPinkHighlight, borderBottomColor: colors.kitPinkShadow },
  menuTileCyan: { backgroundColor: colors.kitCyan, borderTopColor: colors.kitCyanHighlight, borderBottomColor: colors.kitCyanShadow },
  menuTilePressed: { transform: [{ translateY: 4 }], borderBottomWidth: 3 },
  menuTileIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.kitPanel },
  menuTileSymbol: { color: colors.kitPanelInk, fontSize: 23, fontWeight: '900' },
  menuTileLabel: { color: colors.kitPanelInk, fontSize: 12, fontWeight: '900', letterSpacing: 0.9, textAlign: 'center' },
  notificationCard: { gap: spacing.sm },
  notificationText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
