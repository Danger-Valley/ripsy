import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { Phase, type GameState } from '@rps/core';
import type { RedisCommands } from './redis-game-store.js';

export type PushEvent = 'opponent_joined' | 'turn' | 'tie' | 'game_finished';

export interface PushNotification {
  event: PushEvent;
  title: string;
  body: string;
  gameId: string;
}

export interface PushTarget {
  playerId: string;
  notification: PushNotification;
}

export class RedisPushInstallationStore {
  private readonly prefix: string;

  constructor(
    private readonly redis: RedisCommands,
    private readonly ttlSeconds = 60 * 60 * 24 * 90,
    keyPrefix = 'ripsy',
  ) {
    this.prefix = keyPrefix.replace(/:+$/, '');
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) throw new Error('Push installation TTL must be at least 60 seconds');
  }

  async register(playerId: string, fid: string) {
    const key = this.key(playerId);
    await this.redis.sAdd(key, fid);
    await this.redis.expire(key, this.ttlSeconds);
  }

  async unregister(playerId: string, fid: string) {
    await this.redis.sRem(this.key(playerId), fid);
  }

  async list(playerId: string) {
    return this.redis.sMembers(this.key(playerId));
  }

  private key(playerId: string) {
    return `${this.prefix}:push:player:${playerId}:installations`;
  }
}

export class PushNotifier {
  constructor(
    private readonly store: RedisPushInstallationStore,
    private readonly messaging: Messaging | null,
  ) {}

  get enabled() {
    return Boolean(this.messaging);
  }

  async send(targets: PushTarget[]) {
    if (!this.messaging) return;
    await Promise.all(targets.map(target => this.sendToPlayer(target)));
  }

  private async sendToPlayer({ playerId, notification }: PushTarget) {
    const fids = (await this.store.list(playerId)).slice(0, 500);
    if (fids.length === 0) return;
    const result = await this.messaging!.sendEachForMulticast({
      fids,
      notification: { title: notification.title, body: notification.body },
      data: {
        event: notification.event,
        gameId: notification.gameId,
        url: `https://www.ripsy.fun/game/${notification.gameId}`,
      },
      android: { priority: 'high', notification: { sound: 'default', tag: `ripsy-game-${notification.gameId}` } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    await Promise.all(result.responses.map(async (response, index) => {
      const code = response.error?.code;
      if (response.success || !code || !isPermanentFidError(code)) return;
      const fid = fids[index];
      if (fid) await this.store.unregister(playerId, fid);
    }));
  }
}

export function createFirebaseMessaging(environment: NodeJS.ProcessEnv): Messaging | null {
  const rawServiceAccount = environment.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = environment.FIREBASE_PROJECT_ID;
  if (!rawServiceAccount && !projectId) return null;
  if (getApps().length === 0) {
    if (rawServiceAccount) {
      const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
      initializeApp({ credential: cert(serviceAccount), projectId: projectId ?? serviceAccount.projectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getMessaging();
}

export function pushTargetsForAction(action: string, state: GameState, actorId: string): PushTarget[] {
  const bothPlayers = [state.p0, state.p1].filter((value): value is string => Boolean(value));
  const opponent = state.p0 === actorId ? state.p1 : state.p0;
  const notification = (event: PushEvent, title: string, body: string): PushNotification => ({
    event,
    title,
    body,
    gameId: state.gameId,
  });

  if (action === 'joinGame' && opponent) {
    return [{ playerId: opponent, notification: notification('opponent_joined', 'Opponent joined', 'Your RIPSY battle is ready to set up.') }];
  }
  if (state.phase === Phase.Finished) {
    return bothPlayers.map(playerId => ({
      playerId,
      notification: notification('game_finished', 'Battle finished', state.winner === playerId ? 'You won the battle.' : 'Your opponent won the battle.'),
    }));
  }
  if (state.tiePending && (action === 'movePiece' || action === 'chooseWeapon')) {
    const recipients = action === 'chooseWeapon' && opponent ? [opponent] : bothPlayers;
    return recipients.map(playerId => ({
      playerId,
      notification: notification('tie', 'Battle tied', 'Choose rock, paper, or scissors to resolve it.'),
    }));
  }
  if (state.phase === Phase.Active && (action === 'submitLineup' || action === 'movePiece' || action === 'chooseWeapon')) {
    const playerId = state.isP1Turn ? state.p1 : state.p0;
    if (!playerId || (action === 'movePiece' && playerId === actorId)) return [];
    return [{ playerId, notification: notification('turn', 'Your turn', action === 'movePiece' ? 'Your opponent moved. Time to make your move!' : 'Your RIPSY battle is waiting.') }];
  }
  return [];
}

function isPermanentFidError(code: string) {
  return code.endsWith('/installation-id-not-registered') ||
    code.endsWith('/registration-token-not-registered') ||
    code.endsWith('/invalid-registration-token');
}
