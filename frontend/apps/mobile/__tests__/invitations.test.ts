import { createGameInviteUrl, formatRoomCodeInput, normalizeRoomCode } from '../src/invitations';

test.each([
  ['A1B2C3D4', 'a1b2c3d4'],
  [' https://www.ripsy.fun/game/a1b2c3d4 ', 'a1b2c3d4'],
  ['https://ripsy.fun/game/A1B2C3D4?invite=1', 'a1b2c3d4'],
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
  expect(createGameInviteUrl('ABCDEF12')).toBe('https://www.ripsy.fun/game/abcdef12');
  expect(() => createGameInviteUrl('invalid')).toThrow('Invalid room code');
});
