export const RIPSY_WEB_URL = 'https://www.ripsy.fun';
export const DEFAULT_TESTFLIGHT_URL = 'https://testflight.apple.com/join/VU1k1zfy';
export const DEFAULT_ANDROID_INSTALL_URL = `${RIPSY_WEB_URL}/download`;
const gameIdPattern = /^[a-f0-9]{8}$/;
const invitePatterns = [
  /^https:\/\/(?:www\.)?ripsy\.fun\/game\/([a-f0-9]{8})(?:[/?#]|$)/i,
  /^ripsy:\/\/game\/([a-f0-9]{8})(?:[/?#]|$)/i,
];
export function normalizeRoomCode(value: string): string | null {
  const input = value.trim();
  if (gameIdPattern.test(input.toLowerCase())) return input.toLowerCase();
  for (const pattern of invitePatterns) {
    const match = pattern.exec(input);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}
export function formatRoomCodeInput(value: string): string {
  return normalizeRoomCode(value) ?? value.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 8);
}
export function gameRoomPath(gameId: string): `/game/${string}` {
  const code = normalizeRoomCode(gameId);
  if (!code) throw new Error('Invalid room code');
  return `/game/${code}`;
}
/** OS opens installed apps; the query selects the install fallback, not web auto-join. */
export function createGameInviteUrl(gameId: string): string {
  return `${RIPSY_WEB_URL}${gameRoomPath(gameId)}?invite=1`;
}
export function createNativeGameUrl(gameId: string): string { return `ripsy:/${gameRoomPath(gameId)}`; }
export type InviteDevice = 'ios' | 'android' | 'seeker' | 'desktop';
export function detectInviteDevice(userAgent: string, platform = '', maxTouchPoints = 0): InviteDevice {
  if (/iPhone|iPad|iPod/i.test(userAgent) || platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  // Browser model metadata is best-effort only, never an ownership/eligibility check.
  if (/Android/i.test(userAgent)) return /\bSeeker\b/i.test(userAgent) ? 'seeker' : 'android';
  return 'desktop';
}
export interface InviteInstallLinks { ios: string; android: string; seeker: string }
export function androidGameIntent(gameId: string): string {
  const code = normalizeRoomCode(gameId);
  if (!code) throw new Error('Invalid room code');
  return `intent://game/${code}#Intent;scheme=ripsy;package=com.dangervalley.ripsy;S.browser_fallback_url=${encodeURIComponent(`${createGameInviteUrl(code)}&stay=1`)};end`;
}
