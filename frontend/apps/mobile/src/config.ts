import { Platform } from 'react-native';

const productionGameWebSocketUrl = 'wss://backend-production-5d46.up.railway.app';

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
