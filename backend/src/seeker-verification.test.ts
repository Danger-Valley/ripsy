import assert from 'node:assert/strict';
import test from 'node:test';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner } from '@metaplex-foundation/umi';
import { createSignInMessage } from '@solana/wallet-standard-util';
import { SeekerVerificationService, type SeekerRedis } from './seeker-verification.js';

class MemoryRedis implements SeekerRedis {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean }) {
    if (options?.NX && this.data.has(key)) return null;
    this.data.set(key, value); return 'OK';
  }
  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    const key = options.keys[0]!;
    if (script.includes('INCR')) {
      const value = Number(this.data.get(key) ?? 0) + 1;
      this.data.set(key, String(value));
      return value;
    }
    const value = this.data.get(key) ?? null;
    if (value !== null) this.data.delete(key);
    return value;
  }
}

async function proofFor(service: SeekerVerificationService, playerId = 'player') {
  const signer = generateSigner(createUmi('http://localhost:8899'));
  const challenge = await service.issue(playerId);
  const address = signer.publicKey;
  const signedMessage = createSignInMessage({ ...challenge, address });
  const signature = await signer.signMessage(signedMessage);
  return { proof: { address, nonce: challenge.nonce, signature: Array.from(signature), signedMessage: Array.from(signedMessage) } };
}

test('SIWS proof and current SGT ownership are both required and cached for mint preparation', async () => {
  const redis = new MemoryRedis();
  const service = new SeekerVerificationService(redis, { async findGenesisToken() { return 'sgt-mint-address'; } }, 'https://www.ripsy.fun');
  const { proof } = await proofFor(service);
  const verified = await service.verify('player', proof);
  assert.equal(verified.address, proof.address);
  assert.equal(verified.seekerGenesisToken, 'sgt-mint-address');
  await service.assertVerified('player', proof.address);
  await assert.rejects(() => service.verify('player', proof), /expired or was already used/);
  await assert.rejects(() => service.assertVerified('another-player', proof.address), /Verify your Solana Seeker wallet/);
});

test('a valid wallet signature without an SGT is rejected', async () => {
  const service = new SeekerVerificationService(new MemoryRedis(), { async findGenesisToken() { return null; } }, 'https://www.ripsy.fun');
  const { proof } = await proofFor(service);
  await assert.rejects(() => service.verify('player', proof), /exclusive to Solana Seeker wallets/);
});

test('the signed address cannot be replaced with a different wallet', async () => {
  const service = new SeekerVerificationService(new MemoryRedis(), { async findGenesisToken() { return 'sgt'; } }, 'https://www.ripsy.fun');
  const { proof } = await proofFor(service);
  proof.address = generateSigner(createUmi('http://localhost:8899')).publicKey;
  await assert.rejects(() => service.verify('player', proof), /signature is invalid/);
});
