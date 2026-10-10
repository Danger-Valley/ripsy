import assert from 'node:assert/strict';
import test from 'node:test';
import { FIGURE_TOKEN_PAYMENTS, figurePaymentPrice, figurePrice, figureStoreMessage } from '@rps/core/shop';

test('technical store failures become actionable purchase and account messages', () => {
  assert.equal(figureStoreMessage('Minting is unavailable.'), 'Purchases are not available yet.');
  assert.equal(figureStoreMessage('Too many mint requests'), 'Too many purchase requests. Wait a minute and try again.');
  assert.equal(figureStoreMessage('Invalid wallet proof signature'), 'Could not verify your account. Sign in again and try again.');
  assert.equal(figureStoreMessage('Missing Seeker Genesis Token'), 'This figure is only available to eligible Seeker owners. Connect your Seeker wallet and try again.');
  for (const message of ['Core NFT transaction failed', 'RPC error fetching DAS assets', 'Privy self-custodial wallet failed', 'Invalid blockhash']) {
    assert.equal(figureStoreMessage(message, 'Could not load your figures.'), 'Could not load your figures.');
  }
  assert.equal(figureStoreMessage('Could not load the catalog.'), 'Could not load the catalog.');
  assert.equal(figureStoreMessage(null, 'Try again.'), 'Try again.');
});

test('purchase errors retain funds and uncertain payment status guidance', () => {
  assert.equal(figureStoreMessage('Insufficient SOL balance'), 'Not enough funds to complete this purchase.');
  assert.equal(figureStoreMessage('Wallet signature rejected'), 'Approval cancelled. Check purchase status before trying again.');
  assert.equal(figureStoreMessage('Wallet connection was cancelled.'), 'Connection cancelled.');
  assert.equal(figureStoreMessage('Could not open the Solana Mobile store.'), 'Could not open the Solana Mobile store.');
});

test('actual payments retain exact currency units; test purchases are clearly distinct', () => {
  assert.equal(figurePaymentPrice({ priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.fig2 }, 'mainnet-beta'), '1 SKR');
  assert.equal(figurePaymentPrice({ priceLamports: '10000000' }, 'mainnet-beta'), '0.01 SOL'); // Historical receipt.
  assert.equal(figurePrice('11005000', 'mainnet-beta'), '0.011005 SOL');
  assert.equal(figurePrice('11005000', 'devnet'), '0.011005 test credits');
  assert.equal(figurePrice('1', 'mainnet-beta'), '0.000000001 SOL');
  assert.equal(figurePrice('1000000000000000', 'mainnet-beta'), '1000000 SOL');
  assert.throws(() => figurePrice('0.01', 'mainnet-beta'));
});
