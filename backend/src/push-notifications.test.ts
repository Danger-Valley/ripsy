import assert from 'node:assert/strict';
import test from 'node:test';
import { Phase } from '@rps/core';
import { pushTargetsForAction, RedisPushInstallationStore } from './push-notifications.js';
import type { RedisCommands } from './redis-game-store.js';

class FakeRedis implements Partial<RedisCommands> {
  readonly sets = new Map<string, Set<string>>();
  readonly expirations = new Map<string, number>();
  async sAdd(key: string, member: string) { const set = this.sets.get(key) ?? new Set(); const size = set.size; set.add(member); this.sets.set(key, set); return set.size - size; }
  async sMembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
  async sRem(key: string, member: string) { return this.sets.get(key)?.delete(member) ? 1 : 0; }
  async expire(key: string, seconds: number) { this.expirations.set(key, seconds); return true; }
}

test('stores push installations in a Redis set shared by instances', async () => {
  const redis = new FakeRedis() as unknown as RedisCommands;
  const first = new RedisPushInstallationStore(redis, 3600, 'test');
  const second = new RedisPushInstallationStore(redis, 3600, 'test');
  await first.register('alice', 'fid-one');
  await first.register('alice', 'fid-two');
  assert.deepEqual(new Set(await second.list('alice')), new Set(['fid-one', 'fid-two']));
  assert.equal([...((redis as unknown as FakeRedis).expirations.values())][0], 3600);
});

test('targets the waiting player after an active move', () => {
  const targets = pushTargetsForAction('movePiece', {
    gameId: 'abcdefgh', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: true,
    owners: [], pieces: [], live0: 14, live1: 14, attacker: 0, defender: 0,
    outcome: 0, playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  }, 'alice');
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.playerId, 'bob');
  assert.equal(targets[0]?.notification.event, 'turn');
});

test('notifies both players when a battle is finished', () => {
  const targets = pushTargetsForAction('movePiece', {
    gameId: 'abcdefgh', phase: Phase.Finished, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners: [], pieces: [], live0: 14, live1: 13, attacker: 1, defender: 4,
    outcome: 1, playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: 'alice',
  }, 'alice');
  assert.deepEqual(targets.map(target => target.playerId), ['alice', 'bob']);
  assert.match(targets[0]!.notification.body, /won/);
});
