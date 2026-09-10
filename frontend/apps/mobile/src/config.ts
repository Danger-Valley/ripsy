import { Platform } from 'react-native';

const productionGameWebSocketUrl = '';

export function getGameWebSocketUrl() {
  if (__DEV__) {
    const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
    return `ws://${host}:8080`;
  }
  if (!productionGameWebSocketUrl) {
    throw new Error('The production game WebSocket URL has not been configured');
  }
  return productionGameWebSocketUrl;
}
