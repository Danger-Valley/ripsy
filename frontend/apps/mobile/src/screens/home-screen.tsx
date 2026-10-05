import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phase } from '@rps/core';
import { ActiveGameCard } from '../components/active-game-card';
import { SettingsDialog } from '../components/settings-dialogs';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel, ToyShine } from '../components/toy-home-controls';
import { SolanaWalletCard } from '../components/solana-wallet-card';
import { useNativeRipsyGame } from '../hooks/use-native-ripsy-game';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { usePushNotifications } from '../hooks/use-push-notifications';
import { formatRoomCodeInput, normalizeRoomCode } from '../invitations';
import type { RootStackParamList } from '../navigation';
import { saveActiveGameId } from '../storage/active-game';
import { haptics } from '../haptics';
import { sounds } from '../audio/sounds';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;


export function HomeScreen({ navigation, route }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { playerId, sessionToken, isReady } = usePlayerIdentity();
  const game = useNativeRipsyGame(playerId, sessionToken, undefined, isFocused);
  const listActiveGames = game.listGames;
  const isGameConnected = game.isConnected;
  const push = usePushNotifications(sessionToken);
  const { width: windowWidth } = useWindowDimensions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [activeGamePage, setActiveGamePage] = useState(0);
  const createGameInFlight = useRef(false);
  const hasCheckedRestoredGame = useRef(false);
  const restoredGameId = route.params?.restoreGameId;
  const gamesViewportWidth = Math.min(Math.max(0, windowWidth - 56), 440);
  const activeGameCardWidth = Math.max(240, gamesViewportWidth);
  const activeGameSnapInterval = activeGameCardWidth + 8;

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
    if (!isReady || !isGameConnected || createGameInFlight.current) return;
    // Background list/restore requests must not drive this button's spinner.
    createGameInFlight.current = true;
    setIsCreatingGame(true);
    try {
      const gameId = await game.createGame();
      navigation.navigate('Game', { gameId });
    } catch {
      // The hook retains the error; Home intentionally hides transport diagnostics.
    } finally {
      createGameInFlight.current = false;
      setIsCreatingGame(false);
    }
  };

  const joinByCode = () => {
    const gameId = normalizeRoomCode(roomCode);
    if (gameId) navigation.navigate('Game', { gameId });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><ToyShine top="#48D1F0" bottom="#D5EDCE" /></View>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, {
          paddingTop: insets.top + 8,
          paddingBottom: Math.max(16, insets.bottom + 12),
          paddingLeft: Math.max(16, insets.left + 12),
          paddingRight: Math.max(16, insets.right + 12),
        }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor="#0879AD" onRefresh={() => { refreshGames(true).catch(() => undefined); }} />}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        testID="home-scroll">
        <View style={styles.container}>
          <View testID="arcade-home-hero" style={[styles.hero, { height: Math.min(windowWidth - 8, 488) * 2 / 3 }]}>
            <Image pointerEvents="none" accessibilityElementsHidden source={homeArt.rivals} resizeMode="cover" style={styles.heroArt} />
            <View style={styles.heroHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open your army"
                onPress={() => { haptics.select(); sounds.play('click'); navigation.navigate('Army'); }}
                style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
                <View accessibilityElementsHidden style={styles.profilePortrait}>
                  <Image source={homeArt.rivals} resizeMode="contain" style={styles.profileFigure} />
                </View>
                <Text maxFontSizeMultiplier={1.3} style={styles.profileName}>Your army</Text>
              </Pressable>
              <Image accessibilityLabel="RIPSY" accessibilityRole="image" source={homeArt.logo} resizeMode="contain" style={styles.logo} />
              <ToyHomeButton small icon={homeArt.settings} accessibilityLabel="Open settings" onPress={() => setSettingsOpen(true)} />
            </View>
          </View>

          <View style={styles.actions}>
            <ToyHomePanel style={styles.gamesPanel}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={1.8} style={styles.sectionTitle}>Active games</Text>
                <Text accessibilityLabel={game.activeGames.length > 0 ? `Game ${activeGamePage + 1} of ${game.activeGames.length}` : 'No active games'} style={styles.gameCount}>
                  {game.activeGames.length > 0 ? `${activeGamePage + 1}/${game.activeGames.length}` : '0'}
                </Text>
              </View>
              {game.activeGames.length > 0 ? (
                <>
                  <ScrollView
                    accessibilityLabel="Active games"
                    contentContainerStyle={styles.carousel}
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
                  <View accessibilityElementsHidden style={styles.pageDots}>
                    {game.activeGames.map((item, index) => <View key={item.gameId} style={[styles.dot, index === activeGamePage && styles.dotSelected]} />)}
                  </View>
                </>
              ) : (
                <View style={styles.emptyGames}>
                  <Image source={homeArt.swords} style={styles.emptyIcon} resizeMode="contain" />
                  <View style={styles.emptyCopy}>
                    <Text maxFontSizeMultiplier={1.8} style={styles.emptyTitle}>Ready for your next battle?</Text>
                    <Text maxFontSizeMultiplier={1.8} style={styles.emptyText}>Create a room or challenge the computer.</Text>
                  </View>
                </View>
              )}
            </ToyHomePanel>

            <ToyHomeButton
              tone="yellow"
              icon={homeArt.swords}
              accessibilityHint="Creates a new room and opens it"
              onPress={() => { createGame().catch(() => undefined); }}
              disabled={!isReady || !game.isConnected}
              busy={isCreatingGame}>Create battle</ToyHomeButton>
            <ToyHomeButton
              icon={homeArt.robot}
              accessibilityHint="Starts a completely offline battle against the computer"
              onPress={() => navigation.navigate('ComputerGame')}>Play vs computer</ToyHomeButton>

            <ToyHomePanel style={styles.joinPanel}>
              <Image source={homeArt.players} resizeMode="contain" style={styles.joinIcon} />
              <Text maxFontSizeMultiplier={1.6} style={styles.joinLabel}>Join room</Text>
              <TextInput
                accessibilityLabel="Room code"
                accessibilityHint="Enter the eight-character code from your invitation"
                autoCapitalize="none"
                autoCorrect={false}
                maxFontSizeMultiplier={1.6}
                onChangeText={value => setRoomCode(formatRoomCodeInput(value))}
                onSubmitEditing={joinByCode}
                placeholder="Room ID"
                placeholderTextColor="#6690A9"
                returnKeyType="go"
                style={styles.input}
                value={roomCode}
              />
              <ToyHomeButton
                small tone="green"
                accessibilityLabel="Join battle"
                accessibilityHint="Joins the entered battle automatically"
                onPress={joinByCode}
                disabled={!normalizeRoomCode(roomCode)}>
                <Text style={styles.joinArrow}>➜</Text>
              </ToyHomeButton>
            </ToyHomePanel>

            <View style={styles.collectionActions}>
              <ToyHomeButton tile icon={homeArt.army} accessibilityLabel="Set up your army" onPress={() => navigation.navigate('Army')} />
              <ToyHomeButton tile tone="coral" icon={homeArt.shop} accessibilityLabel="Explore figure shop" onPress={() => navigation.navigate('Shop')} />
            </View>
            <SolanaWalletCard focused={isFocused} onRegister={() => navigation.navigate('Shop', { signIn: true })} />
          </View>
        </View>
      </ScrollView>

      <SettingsDialog
        visible={settingsOpen}
        status={push.status}
        ready={isReady}
        onClose={() => setSettingsOpen(false)}
        onEnable={() => { push.enable().catch(() => undefined); }}
        onArmy={() => { setSettingsOpen(false); navigation.navigate('Army'); }}
        onShop={() => { setSettingsOpen(false); navigation.navigate('Shop'); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#48D1F0' },
  scrollContent: { flexGrow: 1 },
  container: { width: '100%', maxWidth: 464, alignSelf: 'center' },
  hero: { position: 'relative', marginHorizontal: -16 },
  heroArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 3 },
  logo: { position: 'absolute', top: -3, left: '21%', width: '58%', height: 106 },
  profile: { width: 59, height: 66, borderRadius: 17, borderColor: '#FFFFFF', borderWidth: 1.5, backgroundColor: '#D7F7FF', shadowColor: '#18688A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.26, shadowRadius: 3, elevation: 3, alignItems: 'center' },
  profilePortrait: { width: 54, height: 48, borderRadius: 14, overflow: 'hidden' },
  profileFigure: { position: 'absolute', width: 180, height: 120, left: -17, top: -41 },
  profileName: { fontFamily: homeFont, color: '#07345C', fontSize: 10, fontWeight: '800' },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.9 },
  actions: { marginTop: -12, gap: 12 },
  gamesPanel: { padding: 11, paddingBottom: 9 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  sectionTitle: { fontFamily: homeFont, color: '#07345C', fontSize: 20, fontWeight: '900' },
  gameCount: { fontFamily: homeFont, color: '#138CC1', fontSize: 15 },
  carousel: { gap: 8 },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B7CFD5', borderColor: '#9ABBC7', borderWidth: 0.5 },
  dotSelected: { backgroundColor: '#00A4E4', borderColor: '#087DAE' },
  emptyGames: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, backgroundColor: '#EDF6F6', borderColor: '#B9D4DD', borderWidth: 1, paddingHorizontal: 9, paddingVertical: 8 },
  emptyIcon: { width: 43, height: 43 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { fontFamily: homeFont, color: '#07345C', fontSize: 14, fontWeight: '800' },
  emptyText: { color: '#54768A', fontSize: 11, lineHeight: 15 },
  joinPanel: { minHeight: 68, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  joinIcon: { width: 33, height: 35 },
  joinLabel: { color: '#07345C', fontFamily: homeFont, fontSize: 16, fontWeight: '900' },
  input: { flex: 1, minWidth: 55, minHeight: 45, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#B2CBD7', backgroundColor: '#FFFFFF', color: '#07345C', fontFamily: homeFont, fontSize: 14, textAlign: 'center', shadowColor: '#578097', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.13, shadowRadius: 2 },
  joinArrow: { color: '#FFFFFF', fontSize: 30 },
  collectionActions: { flexDirection: 'row', gap: 12 },
});
