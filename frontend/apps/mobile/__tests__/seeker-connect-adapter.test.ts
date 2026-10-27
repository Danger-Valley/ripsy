/** @jest-environment-options {"customExportConditions":["node","node-addons"]} */
import { generateKeyPairSync, sign } from 'node:crypto';
import { AppState } from 'react-native';
import { SeekerConnect } from '@solana-mobile/seeker-connect-react-native';
import { createSignInMessage } from '@solana/wallet-standard-util';
import { AccountRole, address, appendTransactionMessageInstructions, compileTransaction, createTransactionMessage,
  getBase58Decoder, getBase64Encoder, getBase64Decoder, getTransactionDecoder, getTransactionEncoder,
  setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, type Blockhash, type SignatureBytes, type Transaction } from '@solana/kit';
import type { PurchaseTransaction, WalletChallenge } from '@rps/core/shop';
import { connectSolanaWallet, disconnectSolanaWallet, getSolanaWalletErrorMessage, proveWallet, proveSeekerWallet, signShopTransaction } from '../src/solana-wallet-adapter.android';
import { loadSolanaWalletSession, saveSolanaWalletSession } from '../src/storage/solana-wallet-session';

jest.mock('../src/seeker-device', () => ({ isSeekerDevice: () => true }));
jest.mock('../src/storage/solana-wallet-session', () => ({ loadSolanaWalletSession: jest.fn(), saveSolanaWalletSession: jest.fn() }));
jest.mock('@solana-mobile/seeker-connect-react-native', () => ({ SeekerConnect: {
  configure: jest.fn(async () => {}), restore: jest.fn(), connect: jest.fn(), signIn: jest.fn(),
  signTransactions: jest.fn(), signAndSendTransactions: jest.fn(), signMessages: jest.fn(), disconnect: jest.fn(async () => {}),
} }));

// Test-only ephemeral keys and memo bytes. No RPC, wallet, broadcast or funding.
const buyerKey = generateKeyPairSync('ed25519');
const serverKey = generateKeyPairSync('ed25519');
const publicBytes = (key: typeof buyerKey) => new Uint8Array(key.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
const buyer = getBase58Decoder().decode(publicBytes(buyerKey));
const server = getBase58Decoder().decode(publicBytes(serverKey));
const authorization = (chain = 'solana:mainnet') => ({ chain, authToken: 'new-sdk-authorization', walletUriBase: 'https://connect.solanamobile.com',
  accounts: [{ address: buyer, publicKey: publicBytes(buyerKey), label: 'My Seeker' }],
  capabilities: { supportedTransactionVersions: ['legacy', 0], features: ['solana:signTransactions'], supportsSignAndSendTransactions: false } });
const previous = { address: buyer, accountAddress: getBase64Decoder().decode(publicBytes(buyerKey)), authToken: 'old-direct-mwa-token', walletUriBase: 'https://old-wallet.invalid' };
function transaction(version: 0 | 'legacy' = 0): Transaction {
  const message = appendTransactionMessageInstructions([{ programAddress: address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    accounts: [{ address: address(server), role: AccountRole.READONLY_SIGNER }], data: new Uint8Array([82, 73, 80, 83, 89]) }],
  setTransactionMessageLifetimeUsingBlockhash({ blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 99n },
    setTransactionMessageFeePayer(address(buyer), createTransactionMessage({ version }))));
  const compiled = compileTransaction(message);
  return { ...compiled, signatures: { ...compiled.signatures, [server]: new Uint8Array(sign(null, Uint8Array.from(compiled.messageBytes), serverKey.privateKey)) as SignatureBytes } };
}
const encode = (value: Transaction) => getBase64Decoder().decode(getTransactionEncoder().encode(value));
const original = transaction();
const order: PurchaseTransaction = { buyer, cluster: 'mainnet-beta', transaction: encode(original) };
function signed(value = original): Transaction {
  return { ...value, signatures: { ...value.signatures, [buyer]: new Uint8Array(sign(null, Uint8Array.from(value.messageBytes), buyerKey.privateKey)) as SignatureBytes } };
}
const challenge: WalletChallenge = { chainId: 'solana:mainnet', domain: 'www.ripsy.fun', uri: 'https://www.ripsy.fun', nonce: 'a'.repeat(32), version: '1',
  statement: 'Verify the RIPSY collection account.', issuedAt: new Date().toISOString(), expirationTime: new Date(Date.now() + 300_000).toISOString() };
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.mocked(loadSolanaWalletSession).mockResolvedValue(previous);
  jest.mocked(saveSolanaWalletSession).mockResolvedValue();
  jest.mocked(SeekerConnect.restore).mockResolvedValue(authorization());
  jest.mocked(SeekerConnect.connect).mockResolvedValue(authorization());
  jest.mocked(SeekerConnect.signTransactions).mockResolvedValue([Uint8Array.from(getTransactionEncoder().encode(signed()))]);
  jest.mocked(SeekerConnect.signIn).mockImplementation(async payload => {
    const signedMessage = createSignInMessage({ ...payload, address: payload!.address!, domain: payload!.domain! });
    return { address: buyer, publicKey: publicBytes(buyerKey), signedMessage, signature: new Uint8Array(sign(null, signedMessage, buyerKey.privateKey)) };
  });
});
afterEach(() => {
  expect(SeekerConnect.signAndSendTransactions).not.toHaveBeenCalled();
  expect(SeekerConnect.signMessages).not.toHaveBeenCalled();
  if (appStateDescriptor) Object.defineProperty(AppState, 'currentState', appStateDescriptor);
});

test('uses RIPSY identity/direct SDK config and cached authorization, never the old MWA token/URI', async () => {
  const result = await connectSolanaWallet(previous);
  expect(result.address).toBe(buyer); expect(result.authToken).toBe('new-sdk-authorization');
  expect(SeekerConnect.configure).toHaveBeenCalledWith({ identity: { name: 'RIPSY', uri: 'https://www.ripsy.fun', icon: 'favicon.ico' },
    chain: 'solana:mainnet', firstConnectWalletBaseUri: 'https://connect.solanamobile.com', associationTimeoutMs: 30_000 });
  expect(SeekerConnect.connect).not.toHaveBeenCalled(); expect(SeekerConnect.signIn).not.toHaveBeenCalled(); expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('old MWA users authorize the SDK once explicitly; connecting never requests a proof or payment', async () => {
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce(null);
  await connectSolanaWallet(previous);
  expect(SeekerConnect.connect).toHaveBeenCalledTimes(1); expect(SeekerConnect.connect).toHaveBeenCalledWith();
  expect(SeekerConnect.signTransactions).not.toHaveBeenCalled(); expect(SeekerConnect.signIn).not.toHaveBeenCalled();
});

test('a cache for another network is forgotten before explicit authorization', async () => {
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce(authorization('solana:devnet'));
  await connectSolanaWallet(previous);
  expect(SeekerConnect.disconnect).toHaveBeenCalledTimes(1); expect(SeekerConnect.connect).toHaveBeenCalledTimes(1);
  expect(jest.mocked(SeekerConnect.disconnect).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(SeekerConnect.connect).mock.invocationCallOrder[0]!);
});

test('a newly returned wrong network is rejected without signatures or persistence', async () => {
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce(null);
  jest.mocked(SeekerConnect.connect).mockResolvedValueOnce(authorization('solana:devnet'));
  await expect(connectSolanaWallet()).rejects.toThrow('different Solana network');
  expect(saveSolanaWalletSession).not.toHaveBeenCalled(); expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('an inconsistent account/public key is rejected instead of choosing a replacement', async () => {
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce({ ...authorization(), accounts: [{ ...authorization().accounts[0]!, address: server }] });
  await expect(connectSolanaWallet()).rejects.toThrow('inconsistent account');
  expect(SeekerConnect.connect).not.toHaveBeenCalled(); expect(saveSolanaWalletSession).not.toHaveBeenCalled();
});

test.each([true, false])('explicit saved-buyer reconnect replaces a wrong cache only with the exact requested account (correct=%s)', async correct => {
  const other = { ...authorization(), accounts: [{ address: server, publicKey: publicBytes(serverKey) }] };
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce(other);
  jest.mocked(SeekerConnect.connect).mockResolvedValueOnce(correct ? authorization() : other);
  const request = connectSolanaWallet(previous, buyer);
  if (correct) await expect(request).resolves.toEqual(expect.objectContaining({ address: buyer }));
  else await expect(request).rejects.toThrow('wallet account changed');
  expect(SeekerConnect.disconnect).toHaveBeenCalledTimes(1); expect(SeekerConnect.connect).toHaveBeenCalledTimes(1);
  expect(SeekerConnect.signTransactions).not.toHaveBeenCalled(); expect(saveSolanaWalletSession).not.toHaveBeenCalled();
});

test.each(['cancelled', 'authorization-declined', 'association-failed', 'session-closed'])('SDK %s propagates once without retry/fallback/payment', async code => {
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce(null);
  const failure = Object.assign(new Error('SDK stopped'), { code });
  jest.mocked(SeekerConnect.connect).mockRejectedValueOnce(failure);
  await expect(connectSolanaWallet()).rejects.toBe(failure);
  expect(SeekerConnect.connect).toHaveBeenCalledTimes(1); expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
  expect(getSolanaWalletErrorMessage(failure)).not.toBe('SDK stopped');
});

test.each([proveWallet, proveSeekerWallet])('SIWS preserves the exact server challenge and selected account (%p)', async prove => {
  const proof = await prove(challenge);
  expect(SeekerConnect.signIn).toHaveBeenCalledWith({ ...challenge, address: buyer });
  expect(proof.address).toBe(buyer); expect(proof.nonce).toBe(challenge.nonce); expect(proof.signature).toHaveLength(64);
  expect(proof.signedMessage).toEqual([...createSignInMessage({ ...challenge, address: buyer })]);
  expect(saveSolanaWalletSession).toHaveBeenCalledWith(expect.objectContaining({ address: buyer, authToken: 'new-sdk-authorization' }));
  expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('SIWS cannot verify another account or a different nonce', async () => {
  const wrongMessage = createSignInMessage({ ...challenge, address: buyer, nonce: 'b'.repeat(32) });
  jest.mocked(SeekerConnect.signIn).mockResolvedValueOnce({ address: buyer, publicKey: publicBytes(buyerKey), signedMessage: wrongMessage,
    signature: new Uint8Array(sign(null, wrongMessage, buyerKey.privateKey)) });
  await expect(proveWallet(challenge)).rejects.toThrow('exact sign-in request');
  jest.mocked(SeekerConnect.signIn).mockResolvedValueOnce({ address: server, publicKey: publicBytes(serverKey), signedMessage: wrongMessage, signature: new Uint8Array(64) });
  await expect(proveWallet(challenge)).rejects.toThrow('exact sign-in request'); expect(saveSolanaWalletSession).not.toHaveBeenCalled();
  jest.mocked(SeekerConnect.signIn).mockResolvedValueOnce({ address: buyer, publicKey: publicBytes(buyerKey),
    signedMessage: createSignInMessage({ ...challenge, address: buyer }), signature: new Uint8Array(64) });
  await expect(proveWallet(challenge)).rejects.toThrow('exact sign-in request');
});

test.each([0, 'legacy'] as const)('passes raw %s pre-signed bytes unchanged and preserves the server signature', async version => {
  const source = transaction(version);
  const resultBytes = Uint8Array.from(getTransactionEncoder().encode(signed(source)));
  jest.mocked(SeekerConnect.signTransactions).mockResolvedValueOnce([resultBytes]);
  const result = await signShopTransaction({ ...order, transaction: encode(source) });
  expect(SeekerConnect.signTransactions).toHaveBeenCalledWith([Uint8Array.from(getBase64Encoder().encode(encode(source)))]);
  expect(result).toBe(getBase64Decoder().decode(resultBytes));
  expect(getTransactionDecoder().decode(resultBytes).signatures[address(server)]).toEqual(source.signatures[address(server)]);
});

test.each(['message', 'server-signature', 'missing-buyer', 'extra-result', 'malformed'] as const)('rejects changed %s without ever submitting', async change => {
  const changed = signed();
  if (change === 'message') { const bytes = Uint8Array.from(changed.messageBytes); bytes[bytes.length - 1] = (bytes[bytes.length - 1]! + 1) % 256; Object.assign(changed, { messageBytes: bytes }); }
  if (change === 'server-signature') changed.signatures[address(server)] = new Uint8Array(64).fill(7) as SignatureBytes;
  if (change === 'missing-buyer') changed.signatures[address(buyer)] = null;
  const raw = Uint8Array.from(getTransactionEncoder().encode(changed));
  jest.mocked(SeekerConnect.signTransactions).mockResolvedValueOnce(change === 'extra-result' ? [raw, raw] : change === 'malformed' ? [new Uint8Array([1, 2, 3])] : [raw]);
  await expect(signShopTransaction(order)).rejects.toThrow();
});

test('unsupported transaction versions and wrong buyers stop before opening a signing prompt', async () => {
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce({ ...authorization(), capabilities: { ...authorization().capabilities, supportedTransactionVersions: ['legacy'] } });
  await expect(signShopTransaction(order)).rejects.toThrow('support this purchase');
  jest.mocked(SeekerConnect.restore).mockResolvedValueOnce({ ...authorization(), accounts: [{ address: server, publicKey: publicBytes(serverKey) }] });
  await expect(signShopTransaction(order)).rejects.toThrow('wallet account changed');
  await expect(signShopTransaction({ ...order, buyer: server })).rejects.toThrow('wallet selected');
  expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('storage failure stops the signing handoff and leaves the saved purchase to its owner', async () => {
  jest.mocked(saveSolanaWalletSession).mockRejectedValueOnce(new Error('Storage failed'));
  await expect(signShopTransaction(order)).rejects.toThrow('Storage failed'); expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('backgrounding during cache restoration cannot open a delayed wallet', async () => {
  jest.mocked(SeekerConnect.restore).mockImplementationOnce(async () => { AppState.currentState = 'background'; return null; });
  await expect(connectSolanaWallet()).rejects.toThrow('Return to RIPSY'); expect(SeekerConnect.connect).not.toHaveBeenCalled();
});

test('a second overlapping request cannot change SDK configuration or open another wallet', async () => {
  let finish!: (value: ReturnType<typeof authorization> | null) => void;
  jest.mocked(SeekerConnect.restore).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = connectSolanaWallet();
  await Promise.resolve(); await expect(signShopTransaction({ ...order, cluster: 'devnet' })).rejects.toThrow('current Seeker request');
  finish(authorization()); await pending; expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('disconnect only forgets SDK authorization, never opens a wallet or signs', async () => {
  await disconnectSolanaWallet(previous);
  expect(SeekerConnect.disconnect).toHaveBeenCalledTimes(1); expect(SeekerConnect.connect).not.toHaveBeenCalled(); expect(SeekerConnect.signTransactions).not.toHaveBeenCalled();
});

test('devnet purchases configure and authorize devnet explicitly without reusing a mainnet cache', async () => {
  jest.mocked(SeekerConnect.connect).mockResolvedValueOnce(authorization('solana:devnet'));
  await signShopTransaction({ ...order, cluster: 'devnet' });
  expect(SeekerConnect.configure).toHaveBeenCalledWith(expect.objectContaining({ chain: 'solana:devnet' }));
  expect(SeekerConnect.disconnect).toHaveBeenCalledTimes(1);
  expect(SeekerConnect.connect).toHaveBeenCalledTimes(1);
});

test('a failed SDK configuration is retryable without opening a wallet on the failed attempt', async () => {
  jest.mocked(SeekerConnect.configure).mockRejectedValueOnce(new Error('Configuration failed'));
  await expect(connectSolanaWallet()).rejects.toThrow('Configuration failed');
  expect(SeekerConnect.connect).not.toHaveBeenCalled(); expect(SeekerConnect.restore).not.toHaveBeenCalled();
  await expect(connectSolanaWallet()).resolves.toEqual(expect.objectContaining({ address: buyer }));
  expect(SeekerConnect.configure).toHaveBeenCalledTimes(2);
});
