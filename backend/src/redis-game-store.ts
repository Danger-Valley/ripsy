import { randomUUID } from 'node:crypto';
import type { Choice, GameState } from '@rps/core';
import {
  chooseWeapon,
  createGameRecord,
  gameView,
  joinGame,
  movePiece,
  parseGameRecord,
  submitLineup,
  type GameRecord,
} from './game-engine.js';

export interface RedisCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  publish(channel: string, message: string): Promise<number>;
  ping(): Promise<string>;
}

type Mutation = (game: GameRecord) => void;

const COMPARE_AND_SWAP = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('PUBLISH', KEYS[2], ARGV[4])
return 1
`;

export interface RedisGameStoreOptions {
  keyPrefix?: string;
  gameTtlSeconds?: number;
  maxMutationRetries?: number;
}

export class RedisGameStore {
  readonly eventPattern: string;
  private readonly prefix: string;
  private readonly gameTtlSeconds: number;
  private readonly maxMutationRetries: number;

  constructor(
    private readonly redis: RedisCommands,
    options: RedisGameStoreOptions = {},
  ) {
    this.prefix = (options.keyPrefix ?? 'ripsy').replace(/:+$/, '');
    this.gameTtlSeconds = options.gameTtlSeconds ?? 60 * 60 * 24 * 7;
    this.maxMutationRetries = options.maxMutationRetries ?? 12;
    this.eventPattern = `${this.prefix}:*:events`;
    if (!Number.isInteger(this.gameTtlSeconds) || this.gameTtlSeconds < 60) {
      throw new Error('Game TTL must be at least 60 seconds');
    }
  }

  async create(playerId: string): Promise<GameState> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = randomUUID().slice(0, 8);
      const game = createGameRecord(id, playerId);
      const created = await this.redis.set(this.gameKey(id), JSON.stringify(game), {
        NX: true,
        EX: this.gameTtlSeconds,
      });
      if (created === 'OK') {
        await this.redis.publish(this.eventChannel(id), id);
        return gameView(game, playerId);
      }
    }
    throw new Error('Could not allocate a unique game ID');
  }

  async get(gameId: string, playerId: string): Promise<GameState> {
    return gameView(await this.getRecord(gameId), playerId);
  }

  async join(gameId: string, playerId: string): Promise<GameState> {
    return this.mutate(gameId, playerId, (game) => joinGame(game, playerId));
  }

  async submitLineup(
    gameId: string,
    playerId: string,
    xs: number[],
    ys: number[],
    pieces: number[],
  ): Promise<GameState> {
    return this.mutate(gameId, playerId, (game) => submitLineup(game, playerId, xs, ys, pieces));
  }

  async move(
    gameId: string,
    playerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): Promise<GameState> {
    return this.mutate(gameId, playerId, (game) => movePiece(game, playerId, fromX, fromY, toX, toY));
  }

  async choose(gameId: string, playerId: string, choice: Choice): Promise<GameState> {
    return this.mutate(gameId, playerId, (game) => chooseWeapon(game, playerId, choice));
  }

  async views(gameId: string): Promise<Array<{ playerId: string; state: GameState }>> {
    const game = await this.getRecord(gameId);
    return [game.p0, game.p1]
      .filter(Boolean)
      .map((playerId) => ({ playerId, state: gameView(game, playerId) }));
  }

  async isReady(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  private async mutate(gameId: string, playerId: string, mutation: Mutation): Promise<GameState> {
    for (let attempt = 0; attempt < this.maxMutationRetries; attempt += 1) {
      const key = this.gameKey(gameId);
      const current = await this.redis.get(key);
      if (!current) throw new Error('Game not found');

      const game = parseGameRecord(current);
      mutation(game);
      const next = JSON.stringify(game);
      const changed = Number(await this.redis.eval(COMPARE_AND_SWAP, {
        keys: [key, this.eventChannel(gameId)],
        arguments: [current, next, String(this.gameTtlSeconds), gameId],
      }));

      if (changed === 1) return gameView(game, playerId);
    }
    throw new Error('The game changed too quickly; please retry');
  }

  private async getRecord(gameId: string): Promise<GameRecord> {
    const value = await this.redis.get(this.gameKey(gameId));
    if (!value) throw new Error('Game not found');
    return parseGameRecord(value);
  }

  private gameKey(gameId: string): string {
    return `${this.prefix}:{${gameId}}:game`;
  }

  private eventChannel(gameId: string): string {
    return `${this.prefix}:{${gameId}}:events`;
  }
}
