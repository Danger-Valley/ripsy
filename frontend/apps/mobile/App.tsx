import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavigationContainer, DefaultTheme, useNavigationContainerRef, type InitialState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { linking, type RootStackParamList } from './src/navigation';
import { ComputerGameScreen, GameScreen } from './src/screens/game-screen';
import { HomeScreen } from './src/screens/home-screen';
import { ShopScreen } from './src/screens/shop-screen';
import { ArmyScreen } from './src/screens/army-screen';
import { normalizeRoomCode } from './src/invitations';
import { loadActiveGameId, saveActiveGameId } from './src/storage/active-game';
import { colors } from './src/theme';
import { StartupSplash } from './src/components/startup-splash';
import { GamePushBannerContext, GamePushOverlay } from './src/components/game-push-banner';
import { useGamePushAlerts } from './src/hooks/use-game-push-alerts';
import { useSoundLifecycle } from './src/hooks/use-sounds';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background, border: colors.border, primary: colors.primary, text: colors.text },
};

function App() {
  useSoundLifecycle();
  const [initialState, setInitialState] = useState<InitialState | undefined>();
  const [hasRestoredNavigation, setHasRestoredNavigation] = useState(false);
  // iOS image callbacks can outlive unmount and paint a recycled Home view.
  // Settle the local splash requests before making those views recyclable.
  const [startupArtworkReady, setStartupArtworkReady] = useState(false);
  const finishStartupArtwork = useCallback(() => setStartupArtworkReady(true), []);
  const [startupUrl, setStartupUrl] = useState<string | null>(null);
  const [visibleGameId, setVisibleGameId] = useState<string | null>(null);
  const [navigationReady, setNavigationReady] = useState(false);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const alerts = useGamePushAlerts(visibleGameId);
  // getInitialNotification is consumable on Android. Read it once and hand the
  // captured URL to navigation instead of losing it in the restoration check.
  const startupLinking = useMemo(() => ({ ...linking, getInitialURL: async () => startupUrl }), [startupUrl]);
  const syncVisibleGame = useCallback(() => {
    const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
    const gameId = route?.name === 'Game' && route.params && 'gameId' in route.params
      ? normalizeRoomCode(String(route.params.gameId)) : null;
    setVisibleGameId(gameId);
    return gameId;
  }, [navigationRef]);

  useEffect(() => {
    let active = true;
    Promise.all([Promise.resolve(linking.getInitialURL?.()).catch(() => null), loadActiveGameId().catch(() => null)])
      .then(([initialUrl, gameId]) => {
        if (!active) return;
        setStartupUrl(initialUrl ?? null);
        if (!initialUrl && gameId) {
          setInitialState({
            index: 0,
            routes: [{ name: 'Home', params: { restoreGameId: gameId } }],
          });
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setHasRestoredNavigation(true); });
    return () => { active = false; };
  }, []);

  if (!hasRestoredNavigation || !startupArtworkReady) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <StartupSplash onArtworkReady={finishStartupArtwork} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <GamePushBannerContext.Provider value={{
        notification: navigationReady ? alerts.notification : null,
        onDismiss: alerts.dismiss,
        onOpen: gameId => {
          if (!navigationRef.isReady()) return;
          navigationRef.navigate('Game', { gameId });
          alerts.dismiss();
        },
      }}>
        <View style={styles.app}>
          <NavigationContainer
            ref={navigationRef}
            initialState={initialState}
            linking={startupLinking}
            onReady={() => { syncVisibleGame(); setNavigationReady(true); }}
            onStateChange={() => {
              saveActiveGameId(syncVisibleGame()).catch(() => undefined);
            }}
            theme={navigationTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
              <Stack.Screen component={ShopScreen} name="Shop" options={{ headerShown: false }} />
              <Stack.Screen component={ArmyScreen} name="Army" options={{ headerShown: false }} />
              <Stack.Screen component={ComputerGameScreen} name="ComputerGame" options={{ headerShown: false }} />
              <Stack.Screen
                component={GameScreen}
                getId={({ params }) => params.gameId}
                name="Game"
                options={{ headerShown: false }}
              />
            </Stack.Navigator>
          </NavigationContainer>
          <GamePushOverlay />
        </View>
      </GamePushBannerContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});

export default App;
