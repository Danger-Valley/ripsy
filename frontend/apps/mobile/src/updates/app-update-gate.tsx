import { useCallback, useState, type PropsWithChildren } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StartupSplash } from '../components/startup-splash';
import { RequiredUpdateScreen } from './required-update-screen';
import { useAppUpdate } from './use-app-update';

/** Outside navigation: no modal, deep link, notification or Back action can dismiss a required update. */
export function AppUpdateGate({ children }: PropsWithChildren) {
  const update = useAppUpdate();
  const [artworkReady, setArtworkReady] = useState(false);
  const finishArtwork = useCallback(() => setArtworkReady(true), []);
  if (update.app && (update.checking || !artworkReady)) {
    return <SafeAreaProvider><StatusBar barStyle="dark-content" /><StartupSplash onArtworkReady={finishArtwork} /></SafeAreaProvider>;
  }
  if (update.app && update.required) {
    return <SafeAreaProvider><StatusBar barStyle="dark-content" /><RequiredUpdateScreen rule={update.required} app={update.app}
      refreshing={update.refreshing} checkFailed={update.error} onCheck={update.refresh} /></SafeAreaProvider>;
  }
  return children;
}
