import assert from 'node:assert/strict';
import test from 'node:test';
import { Phase } from '@rps/core';
import type { Messaging } from 'firebase-admin/messaging';
import { PushNotifier, pushTargetsForAction, RedisPushInstallationStore } from './push-notifications.js';
import type { GameState } from '@rps/core';
import type { RedisCommands } from './redis-game-store.js';

class FakeRedis implements Partial<RedisCommands> {
  readonly sets = new Map<string, Set<string>>();
  readonly expirations = new Map<string, number>();
  async sAdd(key: string, member: string) { const set = this.sets.get(key) ?? new Set(); const size = set.size; set.add(member); this.sets.set(key, set); return set.size - size; }
  async sMembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
  async sRem(key: string, member: string) { return this.sets.get(key)?.delete(member) ? 1 : 0; }
  async expire(key: string, seconds: number) { this.expirations.set(key, seconds); return true; }
}

const activeState: GameState = {
  gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: true,
  owners: [], pieces: [], live0: 14, live1: 14, attacker: 0, defender: 0,
  outcome: 0, playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
};

test('both move directions notify only the next player, with no board/weapon data', () => {
  for (const [actorId, isP1Turn, next] of [['alice', true, 'bob'], ['bob', false, 'alice']] as const) {
    const targets = pushTargetsForAction('movePiece', { ...activeState, isP1Turn }, actorId);
    assert.deepEqual(targets, [{ playerId: next, notification: {
      event: 'turn', gameId: 'abcdef12', title: 'Your turn', body: 'Your opponent moved. Time to make your move!',
    } }]);
  }
});
test('no turn alert when the actor still owns the turn or the game is not active', () => {
  assert.deepEqual(pushTargetsForAction('movePiece', activeState, 'bob'), []);
  assert.deepEqual(pushTargetsForAction('movePiece', { ...activeState, phase: Phase.Created }, 'alice'), []);
});
test('tie resolution requests are not misreported as an ordinary turn', () => {
  const targets = pushTargetsForAction('movePiece', { ...activeState, tiePending: true }, 'alice');
  assert.deepEqual(targets.map(target => target.notification.event), ['tie', 'tie']);
  assert.deepEqual(pushTargetsForAction('chooseWeapon', { ...activeState, tiePending: true }, 'alice').map(target => target.playerId), ['bob']);
});
test('sends a visible background notification with room routing data and a per-room Android tag', async () => {
  const store = new RedisPushInstallationStore(new FakeRedis() as unknown as RedisCommands);
  await store.register('bob', 'bob-installation');
  const sent: unknown[] = [];
  const messaging = { sendEachForMulticast: async (payload: unknown) => { sent.push(payload); return { responses: [{ success: true }] }; } } as unknown as Messaging;
  await new PushNotifier(store, messaging).send(pushTargetsForAction('movePiece', activeState, 'alice'));
  assert.deepEqual(sent, [{
    fids: ['bob-installation'],
    notification: { title: 'Your turn', body: 'Your opponent moved. Time to make your move!' },
    data: { event: 'turn', gameId: 'abcdef12', url: 'https://www.ripsy.fun/game/abcdef12' },
    android: { priority: 'high', notification: { sound: 'default', tag: 'ripsy-game-abcdef12' } },
    apns: { payload: { aps: { sound: 'default' } } },
  }]);
});

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
