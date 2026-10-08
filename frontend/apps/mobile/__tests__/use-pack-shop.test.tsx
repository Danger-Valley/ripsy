import React from 'react';
import Renderer from 'react-test-renderer';
import { usePackShop, parsePackIntent } from '@rps/game-client/use-pack-shop';
import { ShopClient } from '@rps/game-client/shop';
import { INITIAL_PACK, PACK_PAYMENT, type PackOrder } from '@rps/core/packs';
import type { PurchaseStorage } from '@rps/game-client/use-shop';
jest.mock('@rps/game-client/shop', () => ({ ShopClient: jest.fn() }));
const buyer = '11111111111111111111111111111111';
const order: PackOrder = {
  id: 'a'.repeat(64),
  buyer,
  asset: buyer,
  receipt: buyer,
  edition: buyer,
  cluster: 'mainnet-beta',
  transaction: 'AQ==',
  version: 1,
  payment: PACK_PAYMENT,
  drops: INITIAL_PACK.drops,
  status: 'prepared',
  signature: null,
  result: null,
  randomness: null,
  networkFeeLamports: '1000',
  lastValidBlockHeight: 100,
  createdAt: 1,
};
const api = {
  packCatalog: jest.fn(),
  createPack: jest.fn(),
  getPack: jest.fn(),
  submitPack: jest.fn(),
};
let pack!: ReturnType<typeof usePackShop>;
let tree: Renderer.ReactTestRenderer;
let saved: string | null;
const storage: PurchaseStorage = {
  async load() {
    return saved;
  },
  async save(value) {
    saved = value;
  },
};
function Probe() {
  pack = usePackShop('https://api.example.test', 'session', storage);
  return null;
}
async function mount() {
  await Renderer.act(async () => {
    tree = Renderer.create(<Probe />);
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  saved = null;
  jest.clearAllMocks();
  jest
    .mocked(ShopClient)
    .mockImplementation(() => api as unknown as ShopClient);
  api.packCatalog.mockResolvedValue(INITIAL_PACK);
  api.createPack.mockResolvedValue(order);
  api.getPack.mockResolvedValue(order);
  api.submitPack.mockResolvedValue({
    ...order,
    status: 'submitted',
    signature: '1'.repeat(64),
  });
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  jest.useRealTimers();
});
test('persists intent before prepare and approval before opening any signer, on every device', async () => {
  await mount();
  api.createPack.mockImplementationOnce(async () => {
    expect(JSON.parse(saved!).buyer).toBe(buyer);
    return order;
  });
  await Renderer.act(() => pack.prepare(buyer));
  const sign = jest.fn(async () => {
    expect(JSON.parse(saved!).signingStarted).toBe(true);
    return 'AQ==';
  });
  api.submitPack.mockImplementationOnce(async () => {
    expect(JSON.parse(saved!).signed).toBe('AQ==');
    return { ...order, status: 'waiting-result', signature: '1'.repeat(64) };
  });
  await Renderer.act(() => pack.confirm(sign));
  expect(sign).toHaveBeenCalledTimes(1);
  expect(pack.order?.status).toBe('waiting-result');
  await Renderer.act(() => pack.dismiss());
  expect(pack.hasPurchase).toBe(true);
});
test('double tap and rejected approval never create a new random request', async () => {
  await mount();
  await Renderer.act(async () => {
    await Promise.all([pack.prepare(buyer), pack.prepare(buyer)]);
  });
  expect(api.createPack).toHaveBeenCalledTimes(1);
  await Renderer.act(() =>
    pack.confirm(async () => {
      throw new Error('Rejected');
    }),
  );
  await Renderer.act(() => pack.dismiss());
  expect(pack.hasPurchase).toBe(true);
  await Renderer.act(() => pack.confirm(async () => 'AQ=='));
  expect(api.createPack).toHaveBeenCalledTimes(1);
});
test('saved signed pack resumes identical bytes, never a fresh order', async () => {
  saved = JSON.stringify({
    key: 'pack-request-1234567',
    buyer,
    order,
    signingStarted: true,
    signed: 'AQ==',
  });
  await mount();
  await Renderer.act(() => pack.checkStatus());
  expect(api.submitPack).toHaveBeenCalledWith(order.id, 'AQ==');
  expect(api.createPack).not.toHaveBeenCalled();
});
test('resolved result is delivered without paying or signing again, terminal pack can close', async () => {
  saved = JSON.stringify({
    key: 'pack-request-1234567',
    buyer,
    order: { ...order, status: 'waiting-result' },
    signingStarted: true,
  });
  api.getPack.mockResolvedValue({
    ...order,
    status: 'confirmed',
    result: 'jup',
    randomness: 'f'.repeat(64),
  });
  await mount();
  await Renderer.act(() => pack.checkStatus());
  expect(api.submitPack).not.toHaveBeenCalled();
  expect(pack.order?.result).toBe('jup');
  await Renderer.act(() => pack.dismiss());
  expect(saved).toBeNull();
});
test('missing prepare response reuses the persisted idempotency key', async () => {
  saved = JSON.stringify({ key: 'pack-request-1234567', buyer });
  await mount();
  await Renderer.act(() => pack.checkStatus());
  expect(api.createPack).toHaveBeenCalledWith(buyer, 'pack-request-1234567');
});
test('corrupt or mismatched recovery data blocks additional payments', async () => {
  saved = '{broken';
  await mount();
  expect(pack.ready).toBe(false);
  await Renderer.act(() => pack.prepare(buyer));
  expect(api.createPack).not.toHaveBeenCalled();
  expect(() =>
    parsePackIntent(
      JSON.stringify({
        key: 'pack-request-1234567',
        buyer,
        order: {
          ...order,
          buyer: 'So11111111111111111111111111111111111111112',
        },
      }),
    ),
  ).toThrow();
});
