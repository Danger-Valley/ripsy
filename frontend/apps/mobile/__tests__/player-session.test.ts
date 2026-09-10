import { sessionEndpointFromWebSocket } from '@rps/game-client/session';

test.each([
  ['wss://api.ripsy.fun', 'https://api.ripsy.fun/session'],
  ['ws://localhost:8080', 'http://localhost:8080/session'],
  ['wss://game.example.com/socket?version=1', 'https://game.example.com/session'],
])('derives the session endpoint from %s without relying on the platform URL implementation', (socketUrl, sessionUrl) => {
  expect(sessionEndpointFromWebSocket(socketUrl)).toBe(sessionUrl);
});

test('rejects invalid WebSocket endpoints', () => {
  expect(() => sessionEndpointFromWebSocket('https://api.ripsy.fun')).toThrow('WebSocket URL is invalid');
});
