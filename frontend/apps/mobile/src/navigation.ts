import type { LinkingOptions } from '@react-navigation/native';
import { Linking } from 'react-native';
import { getInitialPushUrl, subscribeToPushUrls } from './push-notifications';

export type RootStackParamList = {
  Home: undefined;
  Game: { gameId: string };
};

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['https://www.ripsy.fun', 'ripsy://'],
  config: {
    screens: {
      Home: '',
      Game: 'game/:gameId',
    },
  },
  async getInitialURL() {
    return (await Linking.getInitialURL()) ?? getInitialPushUrl();
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => listener(url));
    const unsubscribePush = subscribeToPushUrls(listener);
    return () => {
      subscription.remove();
      unsubscribePush();
    };
  },
};
