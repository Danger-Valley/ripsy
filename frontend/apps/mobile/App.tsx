import { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme, type InitialState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Linking, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { linking, type RootStackParamList } from './src/navigation';
import { GameScreen } from './src/screens/game-screen';
import { HomeScreen } from './src/screens/home-screen';
import { normalizeRoomCode } from './src/invitations';
import { loadActiveGameId, saveActiveGameId } from './src/storage/active-game';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, border: colors.border, primary: colors.primary, text: colors.text },
};

function App() {
  const [initialState, setInitialState] = useState<InitialState | undefined>();
  const [hasRestoredNavigation, setHasRestoredNavigation] = useState(false);

  useEffect(() => {
    Promise.all([Linking.getInitialURL(), loadActiveGameId()])
      .then(([initialUrl, gameId]) => {
        if (!initialUrl && gameId) {
          setInitialState({
            index: 1,
            routes: [{ name: 'Home' }, { name: 'Game', params: { gameId } }],
          });
        }
      })
      .finally(() => setHasRestoredNavigation(true));
  }, []);

  if (!hasRestoredNavigation) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <NavigationContainer
        initialState={initialState}
        linking={linking}
        onStateChange={state => {
          const route = state?.routes[state.index ?? 0];
          const gameId = route?.name === 'Game' && route.params && 'gameId' in route.params
            ? normalizeRoomCode(String(route.params.gameId))
            : null;
          saveActiveGameId(gameId).catch(() => undefined);
        }}
        theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}>
          <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
          <Stack.Screen component={GameScreen} name="Game" options={{ title: 'Battle' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});

export default App;
