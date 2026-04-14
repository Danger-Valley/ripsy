import { playWithTiebreak } from './playWithTiebreak';

describe('solana-icq-rps', () => {
  it('game full flow', async () => {
    await playWithTiebreak();
  });
});
