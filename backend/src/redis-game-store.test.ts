import assert from 'node:assert/strict';
import test from 'node:test';
import { Phase } from '@rps/core';
import { RedisGameStore, type RedisCommands } from './redis-game-store.js';

class FakeRedis implements RedisCommands {
  readonly values = new Map<string, string>();
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

  async sAdd() { return 0; }
  async sMembers() { return []; }
  async sRem() { return 0; }
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
