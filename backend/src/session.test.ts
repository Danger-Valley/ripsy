import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from './session.js';

const manager = new SessionManager('test-secret-that-is-at-least-32-characters-long', 120);

test('issues and verifies an anonymous player session', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const session = manager.issue('player-1', now);
  const payload = manager.verify(session.token, new Date('2026-09-10T12:01:00.000Z'));
  assert.equal(payload.playerId, 'player-1');
  assert.equal(session.expiresAt, '2026-09-10T12:02:00.000Z');
});

test('rejects tampered and expired sessions', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const session = manager.issue('player-1', now);
  assert.throws(() => manager.verify(`${session.token}x`, now), /Invalid session token/);
  assert.throws(() => manager.verify(session.token, new Date('2026-09-10T12:02:01.000Z')), /expired/);
});
