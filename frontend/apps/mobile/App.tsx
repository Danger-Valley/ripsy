import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList } from './src/navigation';
import { GameScreen } from './src/screens/game-screen';
import { HomeScreen } from './src/screens/home-screen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, border: colors.border, primary: colors.primary, text: colors.text },
};

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}>
          <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
          <Stack.Screen component={GameScreen} name="Game" options={{ title: 'Battle' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
