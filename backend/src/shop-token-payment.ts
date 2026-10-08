// Umi adapter boundary: token payment instructions join the existing Core builder.
import { publicKey, type Signer, type Umi } from '@metaplex-foundation/umi';
import { createIdempotentAssociatedToken, fetchMint, findAssociatedTokenPda, safeFetchToken, TokenState, transferTokensChecked } from '@metaplex-foundation/mpl-toolbox';
import type { TokenPayment } from '@rps/core/shop';
import { ShopError } from './shop-error.js';

export const SHOP_TOKEN_PROGRAM = publicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export async function shopTokenPayment(umi: Umi, buyer: Signer, treasury: string, payment: TokenPayment) {
  const mint = publicKey(payment.mint);
  const mintAccount = await fetchMint(umi, mint);
  // Catalog currencies use classic SPL Token. Never
  // silently substitute Token-2022 or accept a changed precision/owner.
  if (mintAccount.header.owner !== SHOP_TOKEN_PROGRAM || !mintAccount.isInitialized || mintAccount.decimals !== payment.decimals) {
    throw new ShopError('The payment currency could not be verified. No payment was sent.', 503);
  }
  const source = findAssociatedTokenPda(umi, { owner: buyer.publicKey, mint, tokenProgramId: SHOP_TOKEN_PROGRAM });
  const destination = findAssociatedTokenPda(umi, { owner: publicKey(treasury), mint, tokenProgramId: SHOP_TOKEN_PROGRAM });
  const account = await safeFetchToken(umi, source);
  if (!account || account.amount < BigInt(payment.amount)) throw new ShopError(`Not enough ${payment.symbol} to complete this purchase.`);
  if (account.header.owner !== SHOP_TOKEN_PROGRAM || account.owner !== buyer.publicKey || account.mint !== mint || account.state !== TokenState.Initialized) {
    throw new ShopError('The payment account is not available. No payment was sent.');
  }
  return createIdempotentAssociatedToken(umi, { payer: buyer, ata: destination, owner: publicKey(treasury), mint, tokenProgram: SHOP_TOKEN_PROGRAM })
    .add(transferTokensChecked(umi, { source, mint, destination, authority: buyer, amount: BigInt(payment.amount), decimals: payment.decimals }));
}
