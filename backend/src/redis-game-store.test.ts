import assert from 'node:assert/strict';
import test from 'node:test';
import { Phase, Piece } from '@rps/core';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';

class FakeRedis implements RedisCommands {
  readonly values = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  readonly events: Array<{ channel: string; message: string }> = [];

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
    if (options?.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }

  async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
    const [key, channel] = options.keys;
    const [expected, next, _ttl, message] = options.arguments;
    if (!key || !channel || expected === undefined || next === undefined || message === undefined) return 0;
    if (this.values.get(key) !== expected) return 0;
    this.values.set(key, next);
    this.events.push({ channel, message });
    return 1;
  }

  async publish(channel: string, message: string) {
    this.events.push({ channel, message });
    return 1;
  }

  async ping() {
    return 'PONG';
  }

  async sAdd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set<string>();
    const size = set.size;
    set.add(member);
    this.sets.set(key, set);
    return set.size === size ? 0 : 1;
  }
  async sMembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
  async sRem(key: string, member: string) { return this.sets.get(key)?.delete(member) ? 1 : 0; }
  async expire() { return true; }
}

test('persists game state in Redis-compatible storage', async () => {
  const redis = new FakeRedis();
  const firstInstance = new RedisGameStore(redis);
  const secondInstance = new RedisGameStore(redis);
  const created = await firstInstance.create('alice');
  const joined = await secondInstance.join(created.gameId, 'bob');
  assert.equal(joined.phase, Phase.Joined);
  assert.equal((await firstInstance.get(created.gameId, 'alice')).p1, 'bob');
  assert.equal(redis.values.size, 1);
  assert.ok(redis.events.length >= 2);
  assert.deepEqual((await firstInstance.list('alice')).map(game => game.gameId), [created.gameId]);
  assert.deepEqual((await secondInstance.list('bob')).map(game => game.gameId), [created.gameId]);
});

test('persists and replaces a creator lineup before another instance joins', async () => {
  const redis = new FakeRedis();
  const firstInstance = new RedisGameStore(redis);
  const secondInstance = new RedisGameStore(redis);
  const created = await firstInstance.create('alice');
  const xs = Array.from({ length: 14 }, (_, index) => index % 7);
  const ys = Array.from({ length: 14 }, (_, index) => 5 + Math.floor(index / 7));
  const firstPieces = [
    ...Array(4).fill(Piece.Rock),
    ...Array(4).fill(Piece.Paper),
    ...Array(4).fill(Piece.Scissors),
    Piece.Flag,
    Piece.Trap,
  ];
  const secondPieces = [...firstPieces].reverse();

  await firstInstance.submitLineup(created.gameId, 'alice', xs, ys, firstPieces);
  const persisted = await secondInstance.get(created.gameId, 'alice');
  assert.equal(persisted.phase, Phase.LineupP0Set);
  assert.deepEqual(persisted.pieces.filter(piece => piece !== Piece.Empty), firstPieces);

  await secondInstance.submitLineup(created.gameId, 'alice', xs, ys, secondPieces);
  const joined = await firstInstance.join(created.gameId, 'bob');
  assert.equal(joined.phase, Phase.LineupP0Set);
  assert.deepEqual((await firstInstance.get(created.gameId, 'alice')).pieces.filter(piece => piece !== Piece.Empty), secondPieces);
});

test('lists unfinished games by recent activity and removes stale index entries', async () => {
  const redis = new FakeRedis();
  const store = new RedisGameStore(redis);
  const first = await store.create('alice');
  const second = await store.create('alice');
  for (const [key, value] of redis.values) {
    const record = JSON.parse(value) as { id: string; updatedAt: string };
    record.updatedAt = record.id === first.gameId ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z';
    redis.values.set(key, JSON.stringify(record));
  }
  const playerIndex = [...redis.sets.keys()].find(key => key.endsWith(':player:alice:games'))!;
  await redis.sAdd(playerIndex, 'expired-game');

  const games = await store.list('alice');
  assert.deepEqual(games.map(game => game.gameId), [second.gameId, first.gameId]);
  assert.equal((await redis.sMembers(playerIndex)).includes('expired-game'), false);
  assert.deepEqual(await store.list('mallory'), []);
});

test('atomic compare-and-swap admits only one competing player', async () => {
  const redis = new FakeRedis();
  const firstInstance = new RedisGameStore(redis);
  const secondInstance = new RedisGameStore(redis);
  const game = await firstInstance.create('alice');

  const attempts = await Promise.allSettled([
    firstInstance.join(game.gameId, 'bob'),
    secondInstance.join(game.gameId, 'carol'),
  ]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
});
