import { randomBytes } from 'node:crypto';
import { getBase58Encoder } from '@solana/kit';
import { verifySignIn } from '@solana/wallet-standard-util';
import type { WalletChallenge, WalletProof } from '@rps/core/shop';
import { ShopError } from './shop-error.js';

const challengeTtlSeconds = 5 * 60;

export interface WalletRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

interface StoredChallenge { playerId: string; payload: WalletChallenge }

export class WalletVerificationService {
  private readonly domain: string;
  private readonly uri: string;

  constructor(private redis: WalletRedis, publicOrigin: string, private prefix = 'ripsy') {
    this.domain = new URL(publicOrigin).host;
    this.uri = publicOrigin;
  }

  async issue(playerId: string): Promise<WalletChallenge> {
    const bucket = `${this.prefix}:shop:wallet:rate:${playerId}:${Math.floor(Date.now() / 60_000)}`;
    const count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n", { keys: [bucket], arguments: [] }));
    if (count > 10) throw new ShopError('Too many wallet verification requests. Wait a minute and try again.', 429);
    const issuedAt = new Date();
    const payload: WalletChallenge = {
      chainId: 'solana:mainnet',
      domain: this.domain,
      expirationTime: new Date(issuedAt.getTime() + challengeTtlSeconds * 1000).toISOString(),
      issuedAt: issuedAt.toISOString(),
      nonce: randomBytes(16).toString('hex'),
      statement: 'Verify this wallet to manage the collectible figures in your RIPSY army.',
      uri: this.uri,
      version: '1',
    };
    await this.redis.set(this.challengeKey(payload.nonce), JSON.stringify({ playerId, payload } satisfies StoredChallenge), { NX: true, EX: challengeTtlSeconds });
    return payload;
  }

  async verify(playerId: string, input: Record<string, unknown>): Promise<{ address: string }> {
    const proof = parseProof(input);
    const consumed = await this.redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      { keys: [this.challengeKey(proof.nonce)], arguments: [] },
    );
    if (typeof consumed !== 'string') throw new ShopError('This wallet verification request expired or was already used.', 409);
    let stored: StoredChallenge;
    try { stored = JSON.parse(consumed) as StoredChallenge; } catch { throw new ShopError('Invalid wallet verification request.', 400); }
    if (stored.playerId !== playerId || Date.parse(stored.payload.expirationTime) <= Date.now()) {
      throw new ShopError('This wallet verification request expired or was already used.', 409);
    }

    const publicKey = decodeAddress(proof.address);
    const valid = verifySignIn(
      { ...stored.payload, address: proof.address },
      {
        account: { address: proof.address, chains: [], features: [], publicKey },
        signature: Uint8Array.from(proof.signature),
        signedMessage: Uint8Array.from(proof.signedMessage),
      },
    );
    if (!valid) throw new ShopError('The wallet signature is invalid.', 403);
    await this.bindVerified(playerId, proof.address);
    return { address: proof.address };
  }

  /** Bind an address that was authenticated by another trusted shop proof. */
  async bindVerified(playerId: string, address: string): Promise<void> {
    decodeAddress(address);
    await this.redis.set(this.walletKey(playerId), address);
  }

  async clear(playerId: string): Promise<void> {
    await this.redis.eval("return redis.call('DEL', KEYS[1])", {
      keys: [this.walletKey(playerId)],
      arguments: [],
    });
  }

  async address(playerId: string): Promise<string | null> {
    return this.redis.get(this.walletKey(playerId));
  }

  private challengeKey(nonce: string) { return `${this.prefix}:shop:wallet:challenge:${nonce}`; }
  private walletKey(playerId: string) { return `${this.prefix}:shop:wallet:${playerId}`; }
}

function decodeAddress(address: string): Uint8Array {
  try {
    const publicKey = Uint8Array.from(getBase58Encoder().encode(address));
    if (publicKey.length !== 32) throw new Error('Invalid length');
    return publicKey;
  } catch {
    throw new ShopError('Invalid wallet address.', 400);
  }
}

function parseProof(input: Record<string, unknown>): WalletProof {
  if (typeof input.address !== 'string' || typeof input.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(input.nonce)
    || !isByteArray(input.signature, 64, 64) || !isByteArray(input.signedMessage, 1, 4096)) {
    throw new ShopError('Invalid wallet proof.', 400);
  }
  return { address: input.address, nonce: input.nonce, signature: input.signature, signedMessage: input.signedMessage };
}

function isByteArray(value: unknown, min: number, max: number): value is number[] {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}
