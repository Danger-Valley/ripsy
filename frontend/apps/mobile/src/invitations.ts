export const RIPSY_WEB_URL = 'https://www.ripsy.fun';

const gameIdPattern = /^[a-f0-9]{8}$/;
const invitePatterns = [
  /^https:\/\/(?:www\.)?ripsy\.fun\/game\/([a-f0-9]{8})(?:[/?#]|$)/i,
  /^ripsy:\/\/game\/([a-f0-9]{8})(?:[/?#]|$)/i,
];

export function normalizeRoomCode(value: string): string | null {
  const input = value.trim();
  const directCode = input.toLowerCase();
  if (gameIdPattern.test(directCode)) return directCode;
  for (const pattern of invitePatterns) {
    const match = pattern.exec(input);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}

export function formatRoomCodeInput(value: string): string {
  const inviteCode = normalizeRoomCode(value);
  if (inviteCode) return inviteCode;
  return value.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 8);
}

export function createGameInviteUrl(gameId: string): string {
  const roomCode = normalizeRoomCode(gameId);
  if (!roomCode) throw new Error('Invalid room code');
  return `${RIPSY_WEB_URL}/game/${roomCode}`;
}
