import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSigner } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignInMessage } from '@solana/wallet-standard-util';
import { WalletVerificationService, type WalletRedis } from './wallet-verification.js';

class MemoryRedis implements WalletRedis {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); return 'OK';
  }
  async eval(script: string, options: { keys: string[] }) {
    const key = options.keys[0]!;
    if (script.includes('INCR')) {
      const value = Number(this.data.get(key) ?? 0) + 1;
      this.data.set(key, String(value)); return value;
    }
    const value = this.data.get(key) ?? null;
    this.data.delete(key);
    return value;
  }
}

test('a one-time SIWS proof binds an anonymous player session to its wallet', async () => {
  const redis = new MemoryRedis();
  const service = new WalletVerificationService(redis, 'https://www.ripsy.fun');
  const signer = generateSigner(createUmi('http://localhost:8899'));
  const challenge = await service.issue('player');
  const signedMessage = createSignInMessage({ ...challenge, address: signer.publicKey });
  const signature = await signer.signMessage(signedMessage);
  const result = await service.verify('player', {
    address: signer.publicKey,
    nonce: challenge.nonce,
    signature: Array.from(signature),
    signedMessage: Array.from(signedMessage),
  });
  assert.equal(result.address, signer.publicKey);
  assert.equal(await service.address('player'), signer.publicKey);
  await assert.rejects(() => service.verify('player', {
    address: signer.publicKey,
    nonce: challenge.nonce,
    signature: Array.from(signature),
    signedMessage: Array.from(signedMessage),
  }), /expired or was already used/);
});
