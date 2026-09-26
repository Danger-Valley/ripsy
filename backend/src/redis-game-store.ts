import { randomUUID } from 'node:crypto';
import { Phase, type Choice, type GameState } from '@rps/core';
import {
  chooseWeapon,
  createGameRecord,
  gameView,
  joinGame,
  movePiece,
  parseGameRecord,
  submitLineup,
  gameDeadline,
  settleGameDeadline,
  type GameRecord,
} from './game-engine.js';

export interface RedisCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  publish(channel: string, message: string): Promise<number>;
  ping(): Promise<string>;
  sAdd(key: string, member: string): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  sRem(key: string, member: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  zAdd(key: string, member: { score: number; value: string }): Promise<number>;
  zRangeByScore(key: string, min: number, max: number, options?: { LIMIT?: { offset: number; count: number } }): Promise<string[]>;
  zRem(key: string, member: string): Promise<number>;
}

type Mutation = (game: GameRecord) => void;
const MAX_LISTED_GAMES = 20;

const COMPARE_AND_SWAP = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
if ARGV[5] == '' then
  redis.call('ZREM', KEYS[3], ARGV[4])
else
  redis.call('ZADD', KEYS[3], ARGV[5], ARGV[4])
end
redis.call('PUBLISH', KEYS[2], ARGV[4])
return 1
`;

export interface RedisGameStoreOptions {
  keyPrefix?: string;
  gameTtlSeconds?: number;
  maxMutationRetries?: number;
  now?: () => Date;
  validateFigureLineup?: (playerId: string, figureVariants: number[] | undefined, figureAssetIds?: Array<string | null>) => Promise<void>;
}

export class RedisGameStore {
  readonly eventPattern: string;
  private readonly prefix: string;
  private readonly gameTtlSeconds: number;
  private readonly maxMutationRetries: number;
  private readonly now: () => Date;
  private readonly validateFigureLineup?: RedisGameStoreOptions['validateFigureLineup'];

  constructor(
    private readonly redis: RedisCommands,
    options: RedisGameStoreOptions = {},
  ) {
    this.prefix = (options.keyPrefix ?? 'ripsy').replace(/:+$/, '');
    this.gameTtlSeconds = options.gameTtlSeconds ?? 60 * 60 * 24 * 7;
    this.maxMutationRetries = options.maxMutationRetries ?? 12;
    this.now = options.now ?? (() => new Date());
    this.validateFigureLineup = options.validateFigureLineup;
    this.eventPattern = `${this.prefix}:*:events`;
    if (!Number.isInteger(this.gameTtlSeconds) || this.gameTtlSeconds < 60) {
      throw new Error('Game TTL must be at least 60 seconds');
    }
  }

  async create(playerId: string): Promise<GameState> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = randomUUID().slice(0, 8);
      const game = createGameRecord(id, playerId, this.now());
      const created = await this.redis.set(this.gameKey(id), JSON.stringify(game), {
        NX: true,
        EX: this.gameTtlSeconds,
      });
      if (created === 'OK') {
        const deadline = gameDeadline(game);
        if (deadline !== null) {
          await this.redis.zAdd(this.clockDeadlinesKey(), { score: deadline, value: id });
        }
        await this.addToPlayerIndex(playerId, id);
        await this.redis.publish(this.eventChannel(id), id);
        return gameView(game, playerId, this.now());
      }
    }
    throw new Error('Could not allocate a unique game ID');
  }

  async list(playerId: string): Promise<GameState[]> {
    const indexKey = this.playerGamesKey(playerId);
    const gameIds = await this.redis.sMembers(indexKey);
    const staleGameIds: string[] = [];
    const games = (await Promise.all(gameIds.map(async gameId => {
      try {
        const game = await this.getRecord(gameId);
        if ((game.p0 !== playerId && game.p1 !== playerId) || game.phase === Phase.Finished) {
          staleGameIds.push(gameId);
          return null;
        }
        return game;
      } catch {
        staleGameIds.push(gameId);
        return null;
      }
    }))).filter((game): game is GameRecord => game !== null);
    if (staleGameIds.length > 0) await Promise.all(staleGameIds.map(gameId => this.redis.sRem(indexKey, gameId)));
    games.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return games.slice(0, MAX_LISTED_GAMES).map(game => gameView(game, playerId, this.now()));
  }

  async get(gameId: string, playerId: string): Promise<GameState> {
    const game = await this.getRecord(gameId);
    if (game.phase < Phase.Finished && (game.p0 === playerId || game.p1 === playerId)) {
      await this.addToPlayerIndex(playerId, gameId);
    }
    return gameView(game, playerId, this.now());
  }

  async join(gameId: string, playerId: string): Promise<GameState> {
    const state = await this.mutate(gameId, playerId, (game) => joinGame(game, playerId, this.now()));
    if (state.p0 === playerId || state.p1 === playerId) await this.addToPlayerIndex(playerId, gameId);
    return state;
  }

  async submitLineup(
    gameId: string,
    playerId: string,
    xs: number[],
    ys: number[],
    pieces: number[],
    figureVariants?: number[],
    figureAssetIds?: Array<string | null>,
  ): Promise<GameState> {
    await this.validateFigureLineup?.(playerId, figureVariants, figureAssetIds);
    return this.mutate(gameId, playerId, (game) => submitLineup(game, playerId, xs, ys, pieces, this.now(), figureVariants));
  }

  async move(
    gameId: string,
    playerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): Promise<GameState> {
    return this.mutate(gameId, playerId, (game) => movePiece(game, playerId, fromX, fromY, toX, toY, this.now()));
  }

  async choose(gameId: string, playerId: string, choice: Choice): Promise<GameState> {
    return this.mutate(gameId, playerId, (game) => chooseWeapon(game, playerId, choice, this.now()));
  }

  async views(gameId: string): Promise<Array<{ playerId: string; state: GameState }>> {
    const game = await this.getRecord(gameId);
    return [game.p0, game.p1]
      .filter(Boolean)
      .map((playerId) => ({ playerId, state: gameView(game, playerId, this.now()) }));
  }

  async expireDueClocks(limit = 100): Promise<number> {
    const now = this.now();
    const gameIds = await this.redis.zRangeByScore(this.clockDeadlinesKey(), 0, now.getTime(), {
      LIMIT: { offset: 0, count: limit },
    });
    let expired = 0;
    await Promise.all(gameIds.map(async gameId => {
      try {
        const changed = await this.mutateRecord(gameId, game => settleGameDeadline(game, now));
        if (changed) expired += 1;
      } catch (error) {
        if (error instanceof Error && error.message === 'Game not found') {
          await this.redis.zRem(this.clockDeadlinesKey(), gameId);
          return;
        }
        throw error;
      }
    }));
    return expired;
  }

  async isReady(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  private async mutate(gameId: string, playerId: string, mutation: Mutation): Promise<GameState> {
    const game = await this.mutateAndGetRecord(gameId, mutation);
    return gameView(game, playerId, this.now());
  }

  private async mutateAndGetRecord(gameId: string, mutation: Mutation): Promise<GameRecord> {
    for (let attempt = 0; attempt < this.maxMutationRetries; attempt += 1) {
      const key = this.gameKey(gameId);
      const current = await this.redis.get(key);
      if (!current) throw new Error('Game not found');

      const game = parseGameRecord(current, this.now());
      mutation(game);
      const next = JSON.stringify(game);
      const changed = Number(await this.redis.eval(COMPARE_AND_SWAP, {
        keys: [key, this.eventChannel(gameId), this.clockDeadlinesKey()],
        arguments: [current, next, String(this.gameTtlSeconds), gameId, deadlineArgument(game)],
      }));

      if (changed === 1) {
        await this.updatePlayerIndexes(game);
        return game;
      }
    }
    throw new Error('The game changed too quickly; please retry');
  }

  private async mutateRecord(gameId: string, mutation: (game: GameRecord) => boolean): Promise<boolean> {
    let didChange = false;
    await this.mutateAndGetRecord(gameId, game => { didChange = mutation(game); });
    return didChange;
  }

  private async getRecord(gameId: string): Promise<GameRecord> {
    const value = await this.redis.get(this.gameKey(gameId));
    if (!value) throw new Error('Game not found');
    const storedVersion = (JSON.parse(value) as { schemaVersion?: number }).schemaVersion;
    if (storedVersion !== 4) {
      return this.mutateAndGetRecord(gameId, () => undefined);
    }
    const game = parseGameRecord(value, this.now());
    const deadline = gameDeadline(game);
    if (deadline !== null && deadline <= this.now().getTime()) {
      return this.mutateAndGetRecord(gameId, current => { settleGameDeadline(current, this.now()); });
    }
    if (deadline === null) await this.redis.zRem(this.clockDeadlinesKey(), gameId);
    else await this.redis.zAdd(this.clockDeadlinesKey(), { score: deadline, value: gameId });
    return game;
  }

  private gameKey(gameId: string): string {
    return `${this.prefix}:{${gameId}}:game`;
  }

  private eventChannel(gameId: string): string {
    return `${this.prefix}:{${gameId}}:events`;
  }

  private playerGamesKey(playerId: string): string {
    return `${this.prefix}:player:${playerId}:games`;
  }

  private clockDeadlinesKey(): string {
    return `${this.prefix}:clock-deadlines`;
  }

  private async addToPlayerIndex(playerId: string, gameId: string) {
    const key = this.playerGamesKey(playerId);
    await this.redis.sAdd(key, gameId);
    await this.redis.expire(key, this.gameTtlSeconds);
  }

  private async updatePlayerIndexes(game: GameRecord) {
    const players = [game.p0, game.p1].filter(Boolean);
    if (game.phase === Phase.Finished) {
      await Promise.all(players.map(playerId => this.redis.sRem(this.playerGamesKey(playerId), game.id)));
      return;
    }
    await Promise.all(players.map(playerId => this.addToPlayerIndex(playerId, game.id)));
  }
}

function deadlineArgument(game: GameRecord) {
  const deadline = gameDeadline(game);
  return deadline === null ? '' : String(deadline);
}
