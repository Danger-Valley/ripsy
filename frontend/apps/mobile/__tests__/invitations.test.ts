import { createGameInviteUrl, formatRoomCodeInput, normalizeRoomCode } from '../src/invitations';
import { getStateFromPath } from '@react-navigation/native';
import { Linking } from 'react-native';
import { linking } from '../src/navigation';

test.each([
  ['A1B2C3D4', 'a1b2c3d4'],
  [' https://www.ripsy.fun/game/a1b2c3d4 ', 'a1b2c3d4'],
  ['https://ripsy.fun/game/A1B2C3D4?invite=1', 'a1b2c3d4'],
  ['https://www.ripsy.fun/game/a1b2c3d4?invite=1&stay=1', 'a1b2c3d4'],
  ['ripsy://game/a1b2c3d4', 'a1b2c3d4'],
])('normalizes room input %s', (input, expected) => {
  expect(normalizeRoomCode(input)).toBe(expected);
});

test.each(['', 'not-a-room', 'a1b2c3', 'https://example.com/game/a1b2c3d4'])('rejects invalid room input %s', input => {
  expect(normalizeRoomCode(input)).toBeNull();
});

test('formats typed codes and extracts pasted invitation links', () => {
  expect(formatRoomCodeInput('A1B2-C3D4-extra')).toBe('a1b2c3d4');
  expect(formatRoomCodeInput('https://www.ripsy.fun/game/ABCDEF12')).toBe('abcdef12');
});

test('builds the canonical web invitation URL', () => {
  expect(createGameInviteUrl('ABCDEF12')).toBe('https://www.ripsy.fun/game/abcdef12?invite=1');
  expect(() => createGameInviteUrl('invalid')).toThrow('Invalid room code');
});

test.each(['game/abcdef12?invite=1', 'game/abcdef12?invite=1&stay=1'])('navigation opens the exact room for %s', path => {
  const state = getStateFromPath(path, linking.config);
  expect(state?.routes.at(-1)?.name).toBe('Game');
  expect(state?.routes.at(-1)?.params).toMatchObject({ gameId: 'abcdef12' });
});
test('cold launch receives the QR URL without replacing it with a saved game', async () => {
  const url = createGameInviteUrl('abcdef12');
  const spy = jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(url);
  try { expect(await linking.getInitialURL?.()).toBe(url); }
  finally { spy.mockRestore(); }
});
