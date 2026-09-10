import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

interface SessionPayload {
  version: 1;
  playerId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IssuedSession {
  token: string;
  playerId: string;
  expiresAt: string;
}

export class SessionManager {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds = 60 * 60 * 24 * 30,
  ) {
    if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) throw new Error('Session TTL must be at least 60 seconds');
  }

  issue(playerId: string = randomUUID(), now = new Date()): IssuedSession {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const payload: SessionPayload = {
      version: 1,
      playerId,
      issuedAt,
      expiresAt: issuedAt + this.ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      token: `${encodedPayload}.${this.sign(encodedPayload)}`,
      playerId,
      expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    };
  }

  verify(token: string, now = new Date()): SessionPayload {
    const [encodedPayload, providedSignature, extra] = token.split('.');
    if (!encodedPayload || !providedSignature || extra) throw new Error('Invalid session token');
    const expectedSignature = this.sign(encodedPayload);
    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('Invalid session token');

    let payload: SessionPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    } catch {
      throw new Error('Invalid session token');
    }
    if (
      payload.version !== 1 ||
      typeof payload.playerId !== 'string' ||
      !payload.playerId ||
      payload.playerId.length > 100 ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt)
    ) throw new Error('Invalid session token');
    if (payload.expiresAt <= Math.floor(now.getTime() / 1000)) throw new Error('Session token has expired');
    return payload;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
