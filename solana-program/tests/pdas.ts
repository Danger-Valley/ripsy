import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

export const airdropIfNeeded = async (
  conn: Connection,
  pk: PublicKey,
  minSol = 2,
) => {
  const bal = await conn.getBalance(pk);
  if (bal < minSol * LAMPORTS_PER_SOL) {
    const sig = await conn.requestAirdrop(pk, minSol * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, 'confirmed');
  }
};
