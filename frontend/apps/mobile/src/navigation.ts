import type { LinkingOptions } from '@react-navigation/native';

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
};
