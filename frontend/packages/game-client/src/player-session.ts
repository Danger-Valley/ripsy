export interface PlayerSession {
  token: string;
  playerId: string;
  expiresAt: string;
}

export function sessionEndpointFromWebSocket(endpoint: string) {
  const match = /^(wss?):\/\/([^/?#]+)/i.exec(endpoint);
  if (!match) throw new Error('The game WebSocket URL is invalid');
  const protocol = match[1]?.toLowerCase() === 'wss' ? 'https' : 'http';
  return `${protocol}://${match[2]}/session`;
}

export function parseStoredSession(value: string | null): PlayerSession | null {
  if (!value) return null;
  try {
    const session = JSON.parse(value) as PlayerSession;
    if (!session.token || !session.playerId || !session.expiresAt || Date.parse(session.expiresAt) <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function requestPlayerSession(endpoint: string, existingToken?: string): Promise<PlayerSession> {
  const request = (token?: string) => fetch(endpoint, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  let response = await request(existingToken);
  if (response.status === 401 && existingToken) response = await request();
  if (!response.ok) throw new Error(`Could not create a player session (${response.status})`);
  const session = await response.json() as PlayerSession;
  if (!session.token || !session.playerId || !session.expiresAt) throw new Error('The game server returned an invalid session');
  return session;
}
