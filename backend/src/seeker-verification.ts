import { randomBytes } from 'node:crypto';
import { getBase58Encoder } from '@solana/kit';
import { verifySignIn } from '@solana/wallet-standard-util';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getMetadataPointerState,
  getTokenGroupMemberState,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import type { SeekerChallenge, SeekerProof } from '@rps/core/shop';
import { ShopError } from './shop-error.js';

const SGT_MINT_AUTHORITY = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';
const SGT_METADATA_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const SGT_GROUP_MINT_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const challengeTtlSeconds = 5 * 60;
const verificationTtlSeconds = 10 * 60;

export interface SeekerRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export interface SeekerTokenChecker {
  findGenesisToken(walletAddress: string): Promise<string | null>;
}

export interface SeekerGate {
  assertVerified(playerId: string, address: string): Promise<void>;
}

interface StoredChallenge { playerId: string; payload: SeekerChallenge }

export class SeekerVerificationService implements SeekerGate {
  private readonly domain: string;
  private readonly uri: string;

  constructor(
    private redis: SeekerRedis,
    private checker: SeekerTokenChecker,
    publicOrigin: string,
    private prefix = 'ripsy',
  ) {
    this.domain = new URL(publicOrigin).host;
    this.uri = publicOrigin;
  }

  async issue(playerId: string): Promise<SeekerChallenge> {
    const bucket = `${this.prefix}:shop:seeker:rate:${playerId}:${Math.floor(Date.now() / 60_000)}`;
    const count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n", { keys: [bucket], arguments: [] }));
    if (count > 10) throw new ShopError('Too many Seeker verification requests. Wait a minute and try again.', 429);
    const issuedAt = new Date();
    const payload: SeekerChallenge = {
      chainId: 'solana:mainnet',
      domain: this.domain,
      expirationTime: new Date(issuedAt.getTime() + challengeTtlSeconds * 1000).toISOString(),
      issuedAt: issuedAt.toISOString(),
      nonce: randomBytes(16).toString('hex'),
      statement: 'Verify this wallet owns a Solana Seeker Genesis Token to mint a Seeker-exclusive RIPSY figure.',
      uri: this.uri,
      version: '1',
    };
    await this.redis.set(this.challengeKey(payload.nonce), JSON.stringify({ playerId, payload } satisfies StoredChallenge), { NX: true, EX: challengeTtlSeconds });
    return payload;
  }

  async verify(playerId: string, input: Record<string, unknown>): Promise<{ address: string; seekerGenesisToken: string }> {
    const proof = parseProof(input);
    const consumed = await this.redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      { keys: [this.challengeKey(proof.nonce)], arguments: [] },
    );
    if (typeof consumed !== 'string') throw new ShopError('This Seeker verification request expired or was already used.', 409);
    let stored: StoredChallenge;
    try { stored = JSON.parse(consumed) as StoredChallenge; } catch { throw new ShopError('Invalid Seeker verification request.', 400); }
    if (stored.playerId !== playerId || Date.parse(stored.payload.expirationTime) <= Date.now()) throw new ShopError('This Seeker verification request expired or was already used.', 409);

    let publicKey: Uint8Array;
    try {
      publicKey = Uint8Array.from(getBase58Encoder().encode(proof.address));
      if (publicKey.length !== 32) throw new Error('Invalid length');
    } catch {
      throw new ShopError('Invalid Seeker wallet address.', 400);
    }
    const valid = verifySignIn(
      { ...stored.payload, address: proof.address },
      {
        account: { address: proof.address, chains: [], features: [], publicKey },
        signature: Uint8Array.from(proof.signature),
        signedMessage: Uint8Array.from(proof.signedMessage),
      },
    );
    if (!valid) throw new ShopError('The Seeker wallet signature is invalid.', 403);

    let seekerGenesisToken: string | null;
    try { seekerGenesisToken = await this.checker.findGenesisToken(proof.address); }
    catch { throw new ShopError('Seeker verification is temporarily unavailable. Try again shortly.', 503); }
    if (!seekerGenesisToken) throw new ShopError('Seeker fighter is exclusive to Solana Seeker wallets. Connect the Seed Vault wallet that holds your Seeker Genesis Token.', 403);
    await this.redis.set(this.verifiedKey(playerId, proof.address), seekerGenesisToken, { EX: verificationTtlSeconds });
    return { address: proof.address, seekerGenesisToken };
  }

  async assertVerified(playerId: string, address: string): Promise<void> {
    if (!await this.redis.get(this.verifiedKey(playerId, address))) {
      throw new ShopError('Verify your Solana Seeker wallet before minting Seeker fighter.', 403);
    }
  }

  private challengeKey(nonce: string) { return `${this.prefix}:shop:seeker:challenge:${nonce}`; }
  private verifiedKey(playerId: string, address: string) { return `${this.prefix}:shop:seeker:verified:${playerId}:${address}`; }
}

export function createSeekerTokenChecker(rpcUrl: string): SeekerTokenChecker {
  const connection = new Connection(rpcUrl, 'confirmed');
  return {
    async findGenesisToken(walletAddress: string) {
      const { value: accounts } = await connection.getParsedTokenAccountsByOwner(new PublicKey(walletAddress), { programId: TOKEN_2022_PROGRAM_ID });
      const mints = [...new Set(accounts
        .filter(entry => entry.account.data.parsed?.info?.tokenAmount?.amount !== '0')
        .map(entry => entry.account.data.parsed?.info?.mint)
        .filter((mint): mint is string => typeof mint === 'string'))]
        .map(mint => new PublicKey(mint));
      for (let i = 0; i < mints.length; i += 100) {
        const batch = mints.slice(i, i + 100);
        const infos = await connection.getMultipleAccountsInfo(batch);
        for (let j = 0; j < infos.length; j++) {
          const info = infos[j];
          if (!info) continue;
          try {
            const mint = unpackMint(batch[j]!, info, TOKEN_2022_PROGRAM_ID);
            const metadata = getMetadataPointerState(mint);
            const group = getTokenGroupMemberState(mint);
            if (mint.mintAuthority?.toBase58() === SGT_MINT_AUTHORITY
              && metadata?.authority?.toBase58() === SGT_MINT_AUTHORITY
              && metadata.metadataAddress?.toBase58() === SGT_METADATA_ADDRESS
              && group?.group?.toBase58() === SGT_GROUP_MINT_ADDRESS) return mint.address.toBase58();
          } catch {
            // An unrelated or malformed Token-2022 mint is not an SGT.
          }
        }
      }
      return null;
    },
  };
}

function parseProof(input: Record<string, unknown>): SeekerProof {
  if (typeof input.address !== 'string' || typeof input.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(input.nonce)
    || !isByteArray(input.signature, 64, 64) || !isByteArray(input.signedMessage, 1, 4096)) {
    throw new ShopError('Invalid Seeker wallet proof.', 400);
  }
  return { address: input.address, nonce: input.nonce, signature: input.signature, signedMessage: input.signedMessage };
}

function isByteArray(value: unknown, min: number, max: number): value is number[] {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}
