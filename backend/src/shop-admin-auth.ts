import { createHash, randomBytes } from 'node:crypto';
import { publicKey } from '@metaplex-foundation/umi';
import type { ShopRedis } from './shop-service.js';
import { WalletVerificationService } from './wallet-verification.js';
import { ShopError } from './shop-error.js';

export class ShopAdminAuth {
  readonly address: string | null;
  private verifier: WalletVerificationService;
  constructor(private redis: ShopRedis, publicOrigin: string, wallet: string | undefined, private prefix = 'ripsy') {
    this.address = wallet?.trim() ? String(publicKey(wallet.trim())) : null;
    this.verifier = new WalletVerificationService(redis, publicOrigin, `${prefix}:admin-auth`, 'Sign in to RIPSY shop administration. This message does not publish settings or send a transaction.');
  }
  private enabled() { if (!this.address) throw new ShopError('Shop administration is not enabled.', 503); }
  async challenge(playerId: string) {
    this.enabled();
    const count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n", { keys: [`${this.prefix}:admin-auth:rate:${Math.floor(Date.now() / 60000)}`], arguments: [] }));
    if (count > 30) throw new ShopError('Too many admin sign-in attempts. Try again in a minute.', 429);
    return this.verifier.issue(playerId);
  }
  async verify(playerId: string, body: Record<string, unknown>) {
    this.enabled();
    const { address } = await this.verifier.verify(playerId, body);
    await this.verifier.clear(playerId);
    if (address !== this.address) throw new ShopError('This wallet is not the shop administrator.', 403);
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 60000;
    await this.redis.set(this.key(token), JSON.stringify({ address, expiresAt }), { NX: true, EX: 30 * 60 });
    return { token, address, expiresAt };
  }
  async authenticate(authorization: string | undefined): Promise<string> {
    this.enabled();
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ShopError('Sign in with the administrative wallet.', 401);
    const raw = await this.redis.get(this.key(token));
    if (!raw) throw new ShopError('Admin session expired. Sign in again.', 401);
    const session = JSON.parse(raw) as { address: string; expiresAt: number };
    if (session.address !== this.address || session.expiresAt <= Date.now()) throw new ShopError('Admin session expired. Sign in again.', 401);
    return session.address;
  }
  async logout(authorization: string | undefined) {
    await this.authenticate(authorization);
    await this.redis.eval("return redis.call('DEL', KEYS[1])", { keys: [this.key(authorization!.slice(7))], arguments: [] });
  }
  private key(token: string) { return `${this.prefix}:shop:admin:session:${createHash('sha256').update(token).digest('hex')}`; }
}
