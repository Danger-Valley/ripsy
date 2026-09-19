import React from 'react';
import Renderer from 'react-test-renderer';
import { useShop, parsePurchaseIntent, type PurchaseStorage } from '@rps/game-client/use-shop';
import { ShopClient } from '@rps/game-client/shop';
import type { MintOrder } from '@rps/core/shop';

jest.mock('@rps/game-client/shop', () => ({ ShopClient: jest.fn() }));
// use-shop imports its sibling directly; both resolve to this same module.
const prepared: MintOrder = {
  id: 'a'.repeat(64), figureId: 'fig1', buyer: '11111111111111111111111111111111',
  asset: 'So11111111111111111111111111111111111111112', treasury: 'So11111111111111111111111111111111111111112',
  collection: 'SysvarRent111111111111111111111111111111111', cluster: 'devnet',
  priceLamports: '100000000', networkFeeLamports: '1000', transaction: 'AQ==', lastValidBlockHeight: 100,
  createdAt: 1, status: 'prepared', signature: null, error: null,
};
const api = { catalog: jest.fn(), create: jest.fn(), get: jest.fn(), submit: jest.fn() };
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
  api.create.mockResolvedValue(prepared);
  api.get.mockResolvedValue(prepared);
  api.submit.mockResolvedValue({ ...prepared, status: 'submitted', signature: '1'.repeat(64) });
});
afterEach(async () => { if (tree) await Renderer.act(async () => tree.unmount()); jest.useRealTimers(); });

test('persists request before create and signing intent before opening wallet', async () => {
  await mount();
  api.create.mockImplementationOnce(async () => { expect(JSON.parse(saved!).figureId).toBe('fig1'); return prepared; });
  await Renderer.act(() => shop.prepare('fig1', prepared.buyer));
  const sign = jest.fn(async () => { expect(JSON.parse(saved!).signingStarted).toBe(true); return 'signed'; });
  api.submit.mockImplementationOnce(async () => { expect(JSON.parse(saved!).signed).toBe('signed'); return { ...prepared, status: 'confirmed' }; });
  await Renderer.act(() => shop.confirm(sign));
  expect(sign).toHaveBeenCalledTimes(1);
  expect(shop.order?.status).toBe('confirmed');
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

test('reuses persisted idempotency key when the prepare response was lost', async () => {
  saved = JSON.stringify({ key: 'purchase-request-12345', figureId: 'fig1', buyer: prepared.buyer });
  await mount();
  await Renderer.act(() => shop.checkStatus());
  expect(api.create).toHaveBeenCalledWith('fig1', prepared.buyer, 'purchase-request-12345');
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
