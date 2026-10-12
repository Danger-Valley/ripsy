import React from 'react';
import Renderer from 'react-test-renderer';
import { useShop, parsePurchaseIntent, type PurchaseStorage } from '@rps/game-client/use-shop';
import { ShopClient, ShopRequestError } from '@rps/game-client/shop';
import type { MintOrder } from '@rps/core/shop';

jest.mock('@rps/game-client/shop', () => ({ ...jest.requireActual('@rps/game-client/shop'), ShopClient: jest.fn() }));
// use-shop imports its sibling directly; both resolve to this same module.
const prepared: MintOrder = {
  id: 'a'.repeat(64), figureId: 'fig1', buyer: '11111111111111111111111111111111',
  asset: 'So11111111111111111111111111111111111111112', treasury: 'So11111111111111111111111111111111111111112',
  collection: 'SysvarRent111111111111111111111111111111111', cluster: 'devnet',
  priceLamports: '100000000', networkFeeLamports: '1000', transaction: 'AQ==', lastValidBlockHeight: 100,
  createdAt: 1, status: 'prepared', signature: null, error: null,
};
const api = { catalog: jest.fn(), seekerChallenge: jest.fn(), verifySeeker: jest.fn(), clearWallet: jest.fn(), create: jest.fn(), get: jest.fn(), submit: jest.fn() };
let shop!: ReturnType<typeof useShop>;
let tree: Renderer.ReactTestRenderer;
let saved: string | null;
const storage: PurchaseStorage = { async load() { return saved; }, async save(value) { saved = value; } };
function Probe() { shop = useShop('https://api.example.test', 'session', storage); return null; }
async function mount() { await Renderer.act(async () => { tree = Renderer.create(<Probe />); }); }
beforeEach(() => {
  jest.useFakeTimers(); saved = null; jest.clearAllMocks();
  jest.mocked(ShopClient).mockImplementation(() => api as unknown as ShopClient);
  api.catalog.mockResolvedValue({ cluster: 'devnet', figures: [] });
  api.seekerChallenge.mockResolvedValue({ chainId: 'solana:mainnet', domain: 'www.ripsy.fun', expirationTime: new Date(Date.now() + 300_000).toISOString(), issuedAt: new Date().toISOString(), nonce: 'a'.repeat(32), statement: 'Verify Seeker', uri: 'https://www.ripsy.fun', version: '1' });
  api.verifySeeker.mockResolvedValue(undefined);
  api.clearWallet.mockResolvedValue(undefined);
  api.create.mockResolvedValue(prepared);
  api.get.mockResolvedValue(prepared);
  api.submit.mockResolvedValue({ ...prepared, status: 'submitted', signature: '1'.repeat(64) });
});
afterEach(async () => { if (tree) await Renderer.act(async () => tree.unmount()); jest.useRealTimers(); });

test.each(['confirmed', 'failed', 'expired'] as const)('restored %s receipt is cleared and a new purchase starts cleanly', async status => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, order: { ...prepared, status }, signingStarted: true });
  api.create.mockResolvedValueOnce({ ...prepared, id: 'b'.repeat(64) });
  await mount();
  expect(saved).toBeNull();
  expect(shop.hasPurchase).toBe(false);
  await Renderer.act(async () => { await Promise.all([shop.prepare('fig1', prepared.buyer), shop.prepare('fig1', prepared.buyer)]); });
  expect(api.get).not.toHaveBeenCalled();
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(shop.order?.id).toBe('b'.repeat(64));
});

test('a receipt that completes in this session is shown once but is not restored or rechecked', async () => {
  await mount();
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  api.get.mockResolvedValueOnce({ ...prepared, status: 'confirmed' });
  await Renderer.act(() => shop.checkStatus());
  expect(shop.order?.status).toBe('confirmed');
  expect(shop.hasPurchase).toBe(true);
  expect(saved).toBeNull();
  await Renderer.act(() => shop.checkStatus());
  expect(api.get).toHaveBeenCalledTimes(1);

  api.create.mockResolvedValueOnce({ ...prepared, id: 'b'.repeat(64) });
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  expect(api.create).toHaveBeenCalledTimes(2);
  expect(shop.order?.id).toBe('b'.repeat(64));
});

test('persists request before create and signing intent before opening wallet', async () => {
  await mount();
  api.create.mockImplementationOnce(async () => { expect(JSON.parse(saved!).figureId).toBe('fig1'); return prepared; });
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  const sign = jest.fn(async () => { expect(JSON.parse(saved!).signingStarted).toBe(true); return 'signed'; });
  api.submit.mockImplementationOnce(async () => { expect(JSON.parse(saved!).signed).toBe('signed'); return { ...prepared, status: 'confirmed' }; });
  await Renderer.act(() => shop.confirm(sign));
  expect(sign).toHaveBeenCalledTimes(1);
  expect(shop.order?.status).toBe('confirmed');
  expect(saved).toBeNull();
  await Renderer.act(() => shop.dismiss());
  expect(saved).toBeNull();
});

test('double click cannot create another purchase; rejected wallet retries only the same order', async () => {
  await mount();
  await Renderer.act(async () => { await Promise.all([shop.prepare('fig1', prepared.buyer), shop.prepare('fig1', prepared.buyer)]); });
  expect(api.create).toHaveBeenCalledTimes(1);
  await Renderer.act(() => shop.confirm(async () => { throw new Error('User rejected'); }));
  expect(shop.error).toBe('User rejected');
  await Renderer.act(() => shop.dismiss());
  expect(shop.hasPurchase).toBe(true);
  await Renderer.act(() => shop.confirm(async () => 'signed'));
  expect(api.submit).toHaveBeenCalledWith(prepared.id, 'signed');
  expect(api.create).toHaveBeenCalledTimes(1);
});

test('restores signed bytes and resubmits the same transaction after a lost response', async () => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, order: prepared, signingStarted: true, signed: 'signed' });
  await mount();
  await Renderer.act(() => shop.checkStatus());
  expect(api.submit).toHaveBeenCalledWith(prepared.id, 'signed');
  expect(api.create).not.toHaveBeenCalled();
});

test.each([undefined, prepared])('discards a restored unsigned draft instead of retrying it on shop entry (%s)', async order => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, order });
  await mount();
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); await shop.checkStatus(); });
  expect(saved).toBeNull(); expect(shop.hasPurchase).toBe(false); expect(shop.ready).toBe(true);
  expect(api.create).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled();
});

test('keeps a restored wallet handoff even without saved signed bytes', async () => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, order: prepared, signingStarted: true });
  await mount();
  await Renderer.act(() => shop.checkStatus());
  expect(shop.hasPurchase).toBe(true); expect(saved).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith(prepared.id); expect(api.create).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled();
});
test('a submitted order is preserved even when an older record lacks signing markers', async () => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, order: { ...prepared, status: 'submitted', signature: '1'.repeat(64) } });
  await mount();
  expect(shop.order?.status).toBe('submitted'); expect(saved).not.toBeNull();
  expect(api.create).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled();
});

test('corrupt recovery storage blocks new purchases instead of silently dropping the pending order', async () => {
  saved = '{broken';
  await mount();
  expect(shop.ready).toBe(false);
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  expect(api.create).not.toHaveBeenCalled();
  expect(() => parsePurchaseIntent(JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, signed: {} }))).toThrow();
});

test('expired transaction is never sent to the wallet again', async () => {
  await mount();
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  api.get.mockResolvedValueOnce({ ...prepared, status: 'expired' });
  const sign = jest.fn();
  await Renderer.act(() => shop.confirm(sign));
  expect(sign).not.toHaveBeenCalled();
  expect(shop.order?.status).toBe('expired');
});

test('Seeker fighter verifies Seeker ownership before creating the mint order', async () => {
  await mount();
  api.create.mockResolvedValueOnce({ ...prepared, figureId: 'fig2' as const });
  const prove = jest.fn(async challenge => ({ address: prepared.buyer, nonce: challenge.nonce, signature: Array(64).fill(1), signedMessage: [1] }));
  await Renderer.act(() => shop.prepare('fig2', prepared.buyer, prove));
  expect(prove).toHaveBeenCalledTimes(1);
  expect(api.verifySeeker).toHaveBeenCalledWith(expect.objectContaining({ address: prepared.buyer }));
  expect(api.create).toHaveBeenCalledWith('fig2', prepared.buyer, expect.any(String));
  expect(prove.mock.invocationCallOrder[0]).toBeLessThan(api.create.mock.invocationCallOrder[0]!);
});

test('disconnect clears the authenticated inventory wallet binding', async () => {
  await mount();
  await Renderer.act(() => shop.clearWallet());
  expect(api.clearWallet).toHaveBeenCalledTimes(1);
});

const recovery = { code: 'INSUFFICIENT_PURCHASE_TOKEN' as const, mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', required: '1000000', balance: '0' };
test('an insufficient-token attempt does not return or retry when the shop reopens', async () => {
  await mount();
  api.create.mockRejectedValueOnce(new ShopRequestError('Not enough JUP', recovery));
  await Renderer.act(() => shop.prepare('jup', prepared.buyer));
  expect(shop.fundingRequired).toEqual(recovery);
  await Renderer.act(() => tree.unmount());
  await mount();
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); });
  expect(saved).toBeNull(); expect(shop.hasPurchase).toBe(false); expect(shop.fundingRequired).toBeNull(); expect(shop.error).toBeNull();
  expect(api.create).toHaveBeenCalledTimes(1); expect(api.submit).not.toHaveBeenCalled();
});
test('direct buy persists signing before wallet and keeps preparation/signing under one lock', async () => {
  await mount(); let release!: (value: string) => void;
  const sign = jest.fn(() => {
    expect(JSON.parse(saved!).signingStarted).toBe(true);
    expect(JSON.parse(saved!).order.id).toBe(prepared.id);
    return new Promise<string>(resolve => { release = resolve; });
  });
  let purchase!: Promise<void>;
  await Renderer.act(async () => { purchase = shop.prepare('fig1', prepared.buyer, undefined, sign); });
  expect(sign).toHaveBeenCalledWith(prepared); expect(shop.busy).toBe(true);
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); await shop.prepare('fig1', prepared.buyer, undefined, sign); await shop.confirm(sign); });
  expect(api.create).toHaveBeenCalledTimes(1); expect(api.get).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => { release('signed'); await purchase; });
  expect(api.submit).toHaveBeenCalledWith(prepared.id, 'signed'); expect(shop.order?.status).toBe('submitted');
});
test('direct SOL recovery signs only after an explicit SOL click and retains the same key', async () => {
  await mount(); const sign = jest.fn().mockResolvedValue('signed');
  api.create.mockRejectedValueOnce(new ShopRequestError('Not enough JUP', recovery));
  await Renderer.act(() => shop.prepare('jup', prepared.buyer, undefined, sign));
  const key = JSON.parse(saved!).key; expect(sign).not.toHaveBeenCalled(); expect(shop.fundingRequired).toEqual(recovery);
  await Renderer.act(() => shop.buyWithSol(sign));
  expect(api.create).toHaveBeenLastCalledWith('jup', prepared.buyer, key, 'sol');
  expect(JSON.parse(saved!).paymentMode).toBe('sol'); expect(sign).toHaveBeenCalledTimes(1); expect(api.submit).toHaveBeenCalledTimes(1);
});
test('rejected direct buy retains the order and never automatically reopens the signer', async () => {
  await mount(); const sign = jest.fn().mockRejectedValue(new Error('User rejected'));
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer, undefined, sign)); const key = JSON.parse(saved!).key;
  expect(shop.error).toBe('User rejected'); expect(api.submit).not.toHaveBeenCalled();
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); });
  expect(sign).toHaveBeenCalledTimes(1); expect(api.create).toHaveBeenCalledTimes(1);
  sign.mockResolvedValueOnce('signed'); await Renderer.act(() => shop.confirm(sign));
  expect(JSON.parse(saved!).key).toBe(key); expect(api.submit).toHaveBeenCalledWith(prepared.id, 'signed');
});
test('expired order after direct prepare never reaches the wallet', async () => {
  await mount(); const sign = jest.fn(); api.get.mockResolvedValueOnce({ ...prepared, status: 'expired' });
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer, undefined, sign));
  expect(sign).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled(); expect(shop.order?.status).toBe('expired');
});
test('lost responses recover without auto-signing and reuse already-signed bytes', async () => {
  await mount(); const sign = jest.fn().mockResolvedValue('signed');
  api.create.mockRejectedValueOnce(new Error('Network interrupted'));
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer, undefined, sign)); const key = JSON.parse(saved!).key;
  await Renderer.act(() => shop.checkStatus());
  expect(api.create).toHaveBeenLastCalledWith('fig1', prepared.buyer, key); expect(sign).not.toHaveBeenCalled();
  api.submit.mockRejectedValueOnce(new Error('Lost submit reply')); await Renderer.act(() => shop.confirm(sign));
  expect(JSON.parse(saved!).signed).toBe('signed'); await Renderer.act(() => shop.confirm(sign));
  expect(sign).toHaveBeenCalledTimes(1); expect(api.submit).toHaveBeenLastCalledWith(prepared.id, 'signed');
});
test('SOL recovery reuses the saved key, pauses blocked preparation polling and still requires explicit approval', async () => {
  await mount();
  api.create.mockRejectedValueOnce(new ShopRequestError('Not enough JUP', recovery));
  await Renderer.act(() => shop.prepare('jup', prepared.buyer));
  const key = JSON.parse(saved!).key;
  expect(shop.fundingRequired).toEqual(recovery);
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); });
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(shop.fundingRequired).toEqual(recovery);
  api.create.mockImplementationOnce(async (_figure, _buyer, _key, mode) => {
    expect(JSON.parse(saved!).paymentMode).toBe('sol'); expect(mode).toBe('sol');
    return { ...prepared, figureId: 'jup' };
  });
  await Renderer.act(async () => { await Promise.all([shop.buyWithSol(), shop.buyWithSol()]); });
  expect(api.create).toHaveBeenLastCalledWith('jup', prepared.buyer, key, 'sol');
  expect(api.create).toHaveBeenCalledTimes(2);
  expect(api.submit).not.toHaveBeenCalled();
  expect(shop.fundingRequired).toBeNull();
  await Renderer.act(() => shop.buyWithSol());
  expect(api.create).toHaveBeenCalledTimes(2); // Cannot mutate a prepared order.
});
test('a restored SOL draft with no wallet handoff is discarded without creating a swap', async () => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'jup', buyer: prepared.buyer, paymentMode: 'sol' });
  api.create.mockResolvedValue({ ...prepared, figureId: 'jup' });
  await mount(); await Renderer.act(() => shop.checkStatus());
  expect(saved).toBeNull(); expect(shop.hasPurchase).toBe(false); expect(api.create).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled();
});
test('a generic insufficient-looking message never authorizes SOL recovery', async () => {
  await mount(); api.create.mockRejectedValueOnce(new Error('Not enough JUP'));
  await Renderer.act(() => shop.prepare('jup', prepared.buyer));
  expect(shop.fundingRequired).toBeNull();
  await Renderer.act(() => shop.buyWithSol()); expect(api.create).toHaveBeenCalledTimes(1);
  expect(() => parsePurchaseIntent(JSON.stringify({ key: 'purchase-request-12345', figureId: 'jup', buyer: prepared.buyer, paymentMode: 'arbitrary' }))).toThrow();
});

const bulkOrder: MintOrder = { ...prepared, quantity: 2, assets: [prepared.asset, 'SysvarC1ock11111111111111111111111111111111'] };
test('quantity is persisted before prepare, pinned through signing and identical-byte retry', async () => {
  api.catalog.mockResolvedValueOnce({ cluster: 'devnet', figures: [], maxFigureQuantity: 3 });
  api.create.mockResolvedValue(bulkOrder); api.get.mockResolvedValue(bulkOrder); api.submit.mockResolvedValue({ ...bulkOrder, status: 'submitted' });
  await mount(); const sign = jest.fn().mockResolvedValue('signed');
  api.submit.mockRejectedValueOnce(new Error('Lost submit response'));
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer, undefined, sign, 2));
  const pending = JSON.parse(saved!); expect(pending.quantity).toBe(2); expect(pending.signed).toBe('signed');
  expect(api.create).toHaveBeenCalledWith('fig1', prepared.buyer, pending.key, undefined, 2);
  await Renderer.act(() => shop.confirm(sign)); expect(sign).toHaveBeenCalledTimes(1); expect(api.create).toHaveBeenCalledTimes(1);
  expect(shop.order?.quantity).toBe(2); expect(shop.order?.assets).toEqual(bulkOrder.assets);
});
test('quantity survives token shortfall, SOL preparation and explicit wallet approval', async () => {
  api.catalog.mockResolvedValueOnce({ cluster: 'devnet', figures: [], maxFigureQuantity: 3 }); await mount();
  api.create.mockRejectedValueOnce(new ShopRequestError('Not enough JUP', recovery));
  await Renderer.act(() => shop.prepare('jup', prepared.buyer, undefined, undefined, 2));
  const key = JSON.parse(saved!).key; expect(JSON.parse(saved!).quantity).toBe(2);
  const bulk = { ...bulkOrder, figureId: 'jup' }; api.create.mockResolvedValueOnce(bulk); api.get.mockResolvedValueOnce(bulk); api.submit.mockResolvedValueOnce({ ...bulk, status: 'submitted' });
  const sign = jest.fn().mockResolvedValue('signed'); await Renderer.act(() => shop.buyWithSol(sign));
  expect(api.create).toHaveBeenLastCalledWith('jup', prepared.buyer, key, 'sol', 2); expect(sign).toHaveBeenCalledTimes(1);
  expect(shop.purchaseQuantity).toBe(2); expect(JSON.parse(saved!).quantity).toBe(2);
});
test('old backend or a mismatched restored quantity never opens a wallet', async () => {
  await mount(); const sign = jest.fn(); await Renderer.act(() => shop.prepare('fig1', prepared.buyer, undefined, sign, 2));
  expect(api.create).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled(); expect(saved).toBeNull();
  api.catalog.mockResolvedValueOnce({ cluster: 'devnet', figures: [], maxFigureQuantity: 3 }); await Renderer.act(() => shop.loadCatalog());
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer, undefined, sign, 2));
  expect(sign).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled(); expect(shop.error).toMatch(/selected number/);
  expect(() => parsePurchaseIntent(JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer, quantity: 2, order: prepared }))).toThrow(/quantity/);
});

test.each(['failed', 'expired'] as const)('Retry checks the old %s order, then signs only a fresh same-quantity purchase once', async status => {
  api.catalog.mockResolvedValue({ cluster: 'devnet', figures: [], maxFigureQuantity: 3 });
  const original = { ...bulkOrder, figureId: 'jup' };
  api.create.mockResolvedValue(original); api.get.mockResolvedValue({ ...original, status });
  await mount(); await Renderer.act(() => shop.prepare('jup', prepared.buyer, undefined, undefined, 2));
  const key = JSON.parse(saved!).key;
  await Renderer.act(() => shop.checkStatus());
  const next = { ...original, id: 'b'.repeat(64), transaction: 'Ag==' };
  api.create.mockImplementationOnce(async (_figure, _buyer, nextKey) => {
    expect(nextKey).not.toBe(key); expect(JSON.parse(saved!).quantity).toBe(2);
    return next;
  });
  api.get.mockResolvedValueOnce({ ...original, status }).mockResolvedValue(next);
  api.submit.mockResolvedValue({ ...next, status: 'submitted' });
  const sign = jest.fn().mockResolvedValue('new-signed');
  await Renderer.act(async () => { await Promise.all([shop.retry(undefined, sign), shop.retry(undefined, sign)]); });
  expect(api.create).toHaveBeenCalledTimes(2);
  expect(api.get).toHaveBeenNthCalledWith(2, original.id);
  expect(api.create).toHaveBeenLastCalledWith('jup', prepared.buyer, expect.any(String), undefined, 2);
  expect(sign).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledWith(next);
  expect(api.submit).toHaveBeenCalledWith(next.id, 'new-signed');
  expect(shop.order?.id).toBe(next.id); expect(shop.order?.quantity).toBe(2);
});

test('Retry preserves Buy with SOL instead of requiring another token-shortfall step', async () => {
  const original = { ...prepared, figureId: 'jup' };
  api.create.mockRejectedValueOnce(new ShopRequestError('Not enough JUP', recovery));
  await mount(); await Renderer.act(() => shop.prepare('jup', prepared.buyer));
  api.create.mockResolvedValue(original);
  await Renderer.act(() => shop.buyWithSol());
  const oldKey = JSON.parse(saved!).key;
  api.get.mockResolvedValue({ ...original, status: 'expired' });
  await Renderer.act(() => shop.checkStatus());
  await Renderer.act(() => shop.retry());
  const newKey = JSON.parse(saved!).key;
  expect(newKey).not.toBe(oldKey); expect(JSON.parse(saved!).paymentMode).toBe('sol');
  expect(api.create).toHaveBeenLastCalledWith('jup', prepared.buyer, newKey, 'sol');
});

test.each(['prepared', 'submitted', 'confirmed'] as const)('Retry refuses a replacement when the latest server status is %s', async status => {
  await mount(); await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  api.get.mockResolvedValueOnce({ ...prepared, status: 'expired' });
  await Renderer.act(() => shop.checkStatus());
  api.get.mockResolvedValueOnce({ ...prepared, status });
  const sign = jest.fn(); await Renderer.act(() => shop.retry(undefined, sign));
  expect(api.create).toHaveBeenCalledTimes(1); expect(sign).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled(); expect(shop.order?.status).toBe(status);
  expect(shop.error).toMatch(/already complete|still processing/);
});

test('Retry keeps the old receipt after a failed status check or storage write, without signing', async () => {
  await mount(); await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  api.get.mockResolvedValue({ ...prepared, status: 'expired' });
  await Renderer.act(() => shop.checkStatus());
  const sign = jest.fn(); api.get.mockRejectedValueOnce(new Error('Offline'));
  await Renderer.act(() => shop.retry(undefined, sign));
  expect(shop.order?.status).toBe('expired'); expect(shop.error).toBe('Offline');
  const write = jest.spyOn(storage, 'save').mockRejectedValueOnce(new Error('Could not save'));
  await Renderer.act(() => shop.retry(undefined, sign)); write.mockRestore();
  expect(api.create).toHaveBeenCalledTimes(1); expect(sign).not.toHaveBeenCalled();
  expect(shop.order?.id).toBe(prepared.id); expect(shop.error).toBe('Could not save');
});

test('Retry refuses a mismatched status response before replacing the receipt', async () => {
  await mount(); await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  api.get.mockResolvedValueOnce({ ...prepared, status: 'expired' });
  await Renderer.act(() => shop.checkStatus());
  api.get.mockResolvedValueOnce({ ...prepared, id: 'b'.repeat(64), status: 'expired' });
  await Renderer.act(() => shop.retry(undefined, jest.fn()));
  expect(api.create).toHaveBeenCalledTimes(1); expect(shop.order?.id).toBe(prepared.id);
  expect(shop.error).toMatch(/verify your saved purchase/);
});

test('Retry renews Seeker eligibility proof and never replaces an unverified purchase', async () => {
  const original = { ...prepared, figureId: 'fig2' };
  api.create.mockResolvedValue(original); await mount();
  const prove = jest.fn().mockResolvedValue({ address: prepared.buyer });
  await Renderer.act(() => shop.prepare('fig2', prepared.buyer, prove));
  api.get.mockResolvedValue({ ...original, status: 'expired' });
  await Renderer.act(() => shop.checkStatus());
  const sign = jest.fn(); await Renderer.act(() => shop.retry(undefined, sign));
  expect(api.create).toHaveBeenCalledTimes(1); expect(sign).not.toHaveBeenCalled();
  await Renderer.act(() => shop.retry(prove));
  expect(prove).toHaveBeenCalledTimes(2); expect(api.verifySeeker).toHaveBeenCalledTimes(2);
  expect(api.create).toHaveBeenCalledTimes(2);
});
