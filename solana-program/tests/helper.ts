import * as anchor from '@coral-xyz/anchor';
import { Connection, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';

export const airdropIfNeeded = async (
  conn: Connection,
  pk: anchor.web3.PublicKey,
  minSol = 0.5,
) => {
  const bal = await conn.getBalance(pk);
  if (bal < minSol * LAMPORTS_PER_SOL) {
    const sig = await conn.requestAirdrop(pk, minSol * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, 'confirmed');
  }
};

export async function fund(provider: anchor.AnchorProvider, toPubkey: anchor.web3.PublicKey, amount = 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.payer!.publicKey,
      toPubkey,
      lamports: amount,
    })
  );
  await provider.sendAndConfirm(tx, [provider.wallet.payer!]);
}

export async function sendTransaction(
  connection: anchor.web3.Connection,
  ixs: anchor.web3.TransactionInstruction[],
  payer: anchor.web3.Signer
): Promise<string> {
  const balanceBefore = await connection.getBalance(payer.publicKey);

  const tx = new anchor.web3.Transaction().add(...ixs);
  
  tx.feePayer = payer.publicKey;

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  try {
    const txHash = await sendAndConfirmTransaction(
      connection, 
      tx, 
      [payer],
      {
        skipPreflight: false,
        commitment: "confirmed",
      }
    );

    const balanceAfter = await connection.getBalance(payer.publicKey);

    const lamports = balanceBefore - balanceAfter;
    const fee = lamports / LAMPORTS_PER_SOL;

    console.log(`💸 TX Cost: ${lamports} lamports (${fee.toFixed(9)} SOL)`);
    console.log(`🔗 Payer: ${payer.publicKey}`)
    console.log(`🔗 Signature: ${txHash}`)

    return txHash;
  } catch (err) {
    //console.error("Transaction failed:", err);
    throw err;
  }
}

export async function accountExists(
  connection: Connection,
  pubkey: anchor.web3.PublicKey
): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey);
  return info !== null;
}