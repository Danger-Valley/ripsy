import React from 'react';
import Renderer from 'react-test-renderer';
import { usePackShop, parsePackIntent } from '@rps/game-client/use-pack-shop';
import { ShopClient, ShopRequestError } from '@rps/game-client/shop';
import { INITIAL_PACK, PACK_PAYMENT, type PackOrder } from '@rps/core/packs';
import type { PurchaseStorage } from '@rps/game-client/use-shop';
jest.mock('@rps/game-client/shop', () => ({ ...jest.requireActual('@rps/game-client/shop'), ShopClient: jest.fn() }));
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

test.each(['confirmed', 'failed', 'expired'] as const)('new pack replaces a %s receipt only after backend verification', async status => {
  const oldKey = 'pack-request-1234567';
  saved = JSON.stringify({ key: oldKey, buyer, order: { ...order, status, result: status === 'confirmed' ? 'jup' : null, randomness: status === 'confirmed' ? 'f'.repeat(64) : null }, signingStarted: true });
  api.getPack.mockImplementationOnce(async () => {
    expect(JSON.parse(saved!).key).toBe(oldKey);
    expect(api.createPack).not.toHaveBeenCalled();
    return { ...order, status, result: status === 'confirmed' ? 'jup' : null, randomness: status === 'confirmed' ? 'f'.repeat(64) : null };
  });
  api.createPack.mockResolvedValueOnce({ ...order, id: 'b'.repeat(64) });
  await mount();
  await Renderer.act(async () => { await Promise.all([pack.prepare(buyer), pack.prepare(buyer)]); });
  expect(api.getPack).toHaveBeenCalledTimes(1);
  expect(api.getPack).toHaveBeenCalledWith(order.id);
  expect(api.createPack).toHaveBeenCalledTimes(1);
  expect(JSON.parse(saved!).key).not.toBe(oldKey);
  expect(pack.order?.id).toBe('b'.repeat(64));
});

test.each(['submitted', 'waiting-result', 'ready-to-claim', 'network-error'] as const)('cached final pack does not permit another payment on %s', async condition => {
  const oldKey = 'pack-request-1234567';
  saved = JSON.stringify({ key: oldKey, buyer, order: { ...order, status: 'confirmed', result: 'jup', randomness: 'f'.repeat(64) }, signingStarted: true });
  if (condition === 'network-error') api.getPack.mockRejectedValueOnce(new Error('Offline'));
  else api.getPack.mockResolvedValueOnce({ ...order, status: condition });
  await mount(); const sign = jest.fn();
  await Renderer.act(() => pack.prepare(buyer, sign));
  expect(api.createPack).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled();
  expect(JSON.parse(saved!).key).toBe(oldKey);
  expect(pack.order?.status).toBe(condition === 'network-error' ? 'confirmed' : condition);
  expect(pack.error).toBeTruthy();
});

test('a storage failure keeps the final pack receipt and prevents a new payment', async () => {
  const oldKey = 'pack-request-1234567';
  const completed = { ...order, status: 'confirmed', result: 'jup', randomness: 'f'.repeat(64) };
  saved = JSON.stringify({ key: oldKey, buyer, order: completed });
  api.getPack.mockResolvedValueOnce(completed);
  await mount();
  const save = jest.spyOn(storage, 'save').mockImplementation(async value => {
    if (value && JSON.parse(value).key !== oldKey) throw new Error('Storage unavailable');
    saved = value;
  });
  try {
    const sign = jest.fn();
    await Renderer.act(() => pack.prepare(buyer, sign));
    expect(JSON.parse(saved!).key).toBe(oldKey);
    expect(pack.order?.status).toBe('confirmed');
    expect(api.createPack).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled();
  } finally { save.mockRestore(); }
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
  expect(api.createPack).toHaveBeenCalledWith(buyer, 'pack-request-1234567', undefined);
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

test('direct pack buy persists signing before wallet and holds its lock through app switching', async () => {
  await mount(); let release!: (value: string) => void;
  const sign = jest.fn(() => {
    expect(JSON.parse(saved!).signingStarted).toBe(true);
    return new Promise<string>(resolve => { release = resolve; });
  });
  let purchase!: Promise<void>;
  await Renderer.act(async () => { purchase = pack.prepare(buyer, sign); });
  expect(sign).toHaveBeenCalledWith(order); expect(pack.busy).toBe(true);
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); await pack.prepare(buyer, sign); await pack.confirm(sign); });
  expect(sign).toHaveBeenCalledTimes(1); expect(api.createPack).toHaveBeenCalledTimes(1); expect(api.getPack).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => { release('AQ=='); await purchase; });
  expect(api.submitPack).toHaveBeenCalledWith(order.id, 'AQ=='); expect(pack.order?.status).toBe('submitted');
});
test('direct SOL pack buy preserves its saved request and signs after the explicit SOL click', async () => {
  await mount(); const sign = jest.fn().mockResolvedValue('AQ==');
  const recovery = { code: 'INSUFFICIENT_PURCHASE_TOKEN' as const, mint: PACK_PAYMENT.mint, symbol: 'SKR', required: PACK_PAYMENT.amount, balance: '0' };
  api.createPack.mockRejectedValueOnce(new ShopRequestError('Not enough SKR', recovery));
  await Renderer.act(() => pack.prepare(buyer, sign)); const key = JSON.parse(saved!).key; expect(sign).not.toHaveBeenCalled();
  await Renderer.act(() => pack.buyWithSol(sign));
  expect(api.createPack).toHaveBeenLastCalledWith(buyer, key, 'sol');
  expect(sign).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledWith(order);
  expect(pack.order?.drops).toEqual(order.drops); expect(api.submitPack).toHaveBeenCalledWith(order.id, 'AQ==');
});
test('direct pack signing rejection never reopens the signer or re-rolls the pack', async () => {
  await mount(); const sign = jest.fn().mockRejectedValue(new Error('User rejected'));
  await Renderer.act(() => pack.prepare(buyer, sign)); const key = JSON.parse(saved!).key;
  expect(pack.error).toBe('User rejected'); expect(api.submitPack).not.toHaveBeenCalled();
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); });
  expect(sign).toHaveBeenCalledTimes(1); expect(api.createPack).toHaveBeenCalledTimes(1);
  sign.mockResolvedValueOnce('AQ=='); await Renderer.act(() => pack.confirm(sign));
  expect(JSON.parse(saved!).key).toBe(key); expect(api.submitPack).toHaveBeenCalledWith(order.id, 'AQ==');
});
test('a finished pack returned by the final status check never opens signing', async () => {
  await mount(); const sign = jest.fn(); api.getPack.mockResolvedValueOnce({ ...order, status: 'confirmed', result: 'jup' });
  await Renderer.act(() => pack.prepare(buyer, sign));
  expect(sign).not.toHaveBeenCalled(); expect(api.submitPack).not.toHaveBeenCalled(); expect(pack.order?.status).toBe('confirmed');
});
test('lost pack responses recover without auto-signing and reuse already-signed bytes', async () => {
  await mount(); const sign = jest.fn().mockResolvedValue('AQ==');
  api.createPack.mockRejectedValueOnce(new Error('Network interrupted'));
  await Renderer.act(() => pack.prepare(buyer, sign)); const key = JSON.parse(saved!).key;
  await Renderer.act(() => pack.checkStatus());
  expect(api.createPack).toHaveBeenLastCalledWith(buyer, key, undefined); expect(sign).not.toHaveBeenCalled();
  api.submitPack.mockRejectedValueOnce(new Error('Lost submit reply')); await Renderer.act(() => pack.confirm(sign));
  await Renderer.act(() => pack.confirm(sign));
  expect(sign).toHaveBeenCalledTimes(1); expect(api.submitPack).toHaveBeenLastCalledWith(order.id, 'AQ==');
});
test('insufficient SKR offers SOL recovery with the SAME saved request, and never auto-approves or re-rolls', async () => {
  await mount();
  const recovery = { code: 'INSUFFICIENT_PURCHASE_TOKEN' as const, mint: PACK_PAYMENT.mint, symbol: 'SKR', required: PACK_PAYMENT.amount, balance: '0' };
  api.createPack.mockRejectedValueOnce(new ShopRequestError('Not enough SKR', recovery));
  await Renderer.act(() => pack.prepare(buyer)); const key = JSON.parse(saved!).key;
  await Renderer.act(async () => { jest.advanceTimersByTime(12000); });
  expect(pack.fundingRequired).toEqual(recovery); expect(api.createPack).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => { await Promise.all([pack.buyWithSol(), pack.buyWithSol()]); });
  expect(api.createPack).toHaveBeenLastCalledWith(buyer, key, 'sol');
  expect(JSON.parse(saved!).paymentMode).toBe('sol'); expect(api.createPack).toHaveBeenCalledTimes(2);
  expect(api.submitPack).not.toHaveBeenCalled(); expect(pack.fundingRequired).toBeNull();
  await Renderer.act(() => pack.buyWithSol()); expect(api.createPack).toHaveBeenCalledTimes(2);
});
test('pack SOL recovery mode survives restart; generic errors do not offer a swap', async () => {
  saved = JSON.stringify({ key: 'pack-request-1234567', buyer, paymentMode: 'sol' });
  await mount(); await Renderer.act(() => pack.checkStatus());
  expect(api.createPack).toHaveBeenCalledWith(buyer, 'pack-request-1234567', 'sol');
  await Renderer.act(() => pack.dismiss());
  api.createPack.mockRejectedValueOnce(new Error('Not enough SKR'));
  await Renderer.act(() => pack.prepare(buyer)); expect(pack.fundingRequired).toBeNull();
  expect(() => parsePackIntent(JSON.stringify({ key: 'pack-request-1234567', buyer, paymentMode: 'other' }))).toThrow();
});
