import React from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Linking, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Renderer from 'react-test-renderer';
import { useShop } from '@rps/game-client/use-shop';
import { usePackShop } from '@rps/game-client/use-pack-shop';
import { INITIAL_PACK, PACK_PAYMENT } from '@rps/core/packs';
import { FIGURES, FIGURE_TOKEN_PAYMENTS, figurePaymentPrice, type MintOrder, type ShopFigure } from '@rps/core/shop';
import { ShopScreen } from '../src/screens/shop-screen';
import { StatusBanner } from '../src/components/status-banner';
import { ShopPack } from '../src/components/shop-pack';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { useSolanaWallet } from '../src/hooks/use-solana-wallet';
import { usePrivyWallet } from '../src/hooks/use-privy-wallet';
import { proveSeekerWallet, signShopTransaction } from '../src/solana-wallet-adapter';
import { saveFigureSlots } from '../src/storage/figure-loadout';

jest.mock('@rps/game-client/use-shop');
jest.mock('@rps/game-client/use-pack-shop');
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-solana-wallet');
jest.mock('../src/hooks/use-privy-wallet');
jest.mock('../src/solana-wallet-adapter', () => ({ proveSeekerWallet: jest.fn(), signShopTransaction: jest.fn() }));
jest.mock('../src/storage/figure-loadout', () => ({ saveFigureSlots: jest.fn(() => Promise.resolve()) }));

const buyer = 'buyer11111111111111111111111111111';
const fig2: ShopFigure = { id: 'fig2', variant: 2, name: 'Seeker fighter', description: 'A new face for your collection.', imageUrl: 'https://example.test/fig2.png', priceLamports: '10000000', available: true, seekerExclusive: true };
const order: MintOrder = { id: 'a'.repeat(64), figureId: 'fig2', buyer, asset: 'asset11111111111111111111111111111', treasury: 'treasury11111111111111111111111111', collection: 'collection11111111111111111111111', cluster: 'mainnet-beta', priceLamports: '10000000', networkFeeLamports: '1005000', transaction: 'AQ==', lastValidBlockHeight: 100, createdAt: 1, status: 'prepared', signature: null, error: null };
const shop = { catalog: { cluster: 'mainnet-beta', collection: order.collection, treasury: order.treasury, figures: [fig2] }, order: null, hasPurchase: false, signingStarted: false, ready: true, busy: false, error: null, prepare: jest.fn(), retry: jest.fn(), confirm: jest.fn(), dismiss: jest.fn(), checkStatus: jest.fn(), loadCatalog: jest.fn(), clearWallet: jest.fn() };
const pack = { ...shop, catalog: { ...INITIAL_PACK, available: true }, prepare: jest.fn(), confirm: jest.fn(), dismiss: jest.fn(), checkStatus: jest.fn(), loadCatalog: jest.fn() };
const disconnect = jest.fn();
const connect = jest.fn();
const sendCode = jest.fn();
const verifyCode = jest.fn();
const navigate = jest.fn();
const goBack = jest.fn();
let tree: Renderer.ReactTestRenderer;
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.clearAllMocks();
  for (const action of [pack.prepare, pack.confirm, pack.dismiss, pack.checkStatus, pack.loadCatalog]) action.mockResolvedValue(undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  for (const action of [shop.prepare, shop.retry, shop.confirm, shop.dismiss, shop.checkStatus, shop.loadCatalog, shop.clearWallet, disconnect, connect, sendCode, verifyCode]) action.mockResolvedValue(undefined);
  jest.mocked(useShop).mockReturnValue(shop as unknown as ReturnType<typeof useShop>);
  jest.mocked(usePackShop).mockReturnValue(pack as unknown as ReturnType<typeof usePackShop>);
  jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: true, playerId: 'player', sessionToken: 'token', error: null });
  jest.mocked(useSolanaWallet).mockReturnValue({ address: null, label: null, status: 'disconnected', error: null, isSupported: false, connect, disconnect });
  jest.mocked(usePrivyWallet).mockReturnValue({ configured: true, address: null, error: null, activity: 'idle', status: 'unauthenticated', busy: false, codeSent: false, sendCode, verifyCode, disconnect, signShopTransaction: jest.fn() } as unknown as ReturnType<typeof usePrivyWallet>);
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); if (appStateDescriptor) Object.defineProperty(AppState, 'currentState', appStateDescriptor); });
async function mount(params?: { signIn: boolean }) { await Renderer.act(async () => { tree = Renderer.create(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params } as never} />); }); }
async function mountRecovery() {
  await mount();
  expect(visibleModals()).toHaveLength(0);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
  await press('Continue purchase');
}
function button(label: string) { return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]; }
async function press(label: string) { await Renderer.act(async () => { await button(label).props.onPress(); }); }
function text(value: string) { return tree.root.findAllByType(Text).some(node => node.props.children === value); }
function setShop(next: object) { jest.mocked(useShop).mockReturnValue({ ...shop, purchaseQuantity: 1, purchaseBuyer: null, fundingRequired: null, buyWithSol: jest.fn(), ...next } as ReturnType<typeof useShop>); }
function external(address: string | null = buyer) { jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: true, address, status: address ? 'connected' : 'disconnected' }); }
function visibleModals() { return tree.root.findAllByType(Modal).filter(node => node.props.visible); }
function purchaseModal(id: 'figure' | 'pack') {
  const modal = visibleModals().find(node => node.findAllByProps({ testID: `${id}-purchase-dialog` }).length > 0);
  expect(modal).toBeDefined();
  return modal!;
}
function expectSimplePurchase(id: 'figure' | 'pack') {
  const labels = purchaseModal(id).findAllByType(Text).flatMap(node => [node.props.children].flat(Infinity)).filter(value => typeof value === 'string');
  for (const label of ['PREPARE', 'SIGN', 'APPROVE', 'COMPLETE', 'PURCHASE COMPLETE']) expect(labels).not.toContain(label);
  expect(labels.join(' ')).not.toMatch(/Purchase complete\.|Figure price|Pay with SOL|Estimated additional fees|Estimated total|SOL covers|Sold by RIPSY|Payment details|PURCHASE ACCOUNT|SELLER ACCOUNT|View payment record|View pack record/);
}
async function updateScreen() { await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params: undefined } as never} />)); }
function setPack(next: object) { jest.mocked(usePackShop).mockReturnValue({ ...pack, ...next } as unknown as ReturnType<typeof usePackShop>); }

test('only visible shop showcases animate, and an account popup stops them without touching purchases', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await mount();
  const preview = () => tree.root.find(node => node.props.figure?.id === 'fig2' && typeof node.props.active === 'boolean');
  expect(preview().props.active).toBe(false);
  await Renderer.act(() => {
    tree.root.findByProps({ testID: 'shop-card-fig2' }).props.onLayout({ nativeEvent: { layout: { y: 100, height: 500 } } });
    tree.root.findByProps({ testID: 'shop-scroll' }).props.onLayout({ nativeEvent: { layout: { height: 600 } } });
  });
  expect(preview().props.active).toBe(true);
  await press('Register'); expect(preview().props.active).toBe(false);
  await press('Close shop account'); expect(preview().props.active).toBe(true);
  await Renderer.act(() => tree.root.findByProps({ testID: 'shop-scroll' }).props.onScroll({ nativeEvent: { contentOffset: { y: 400 } } }));
  expect(preview().props.active).toBe(false);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
  expect(pack.prepare).not.toHaveBeenCalled(); expect(signShopTransaction).not.toHaveBeenCalled();
});

test.each(['figure-recovery', 'pack-recovery', 'seeker-wallet', 'email-account', 'session'] as const)('shop entry explains %s loading, guards purchase taps and unlocks without auto-signing', async loading => {
  external();
  if (loading === 'figure-recovery') setShop({ ready: false });
  if (loading === 'pack-recovery') setPack({ ready: false });
  if (loading === 'seeker-wallet') jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), status: 'loading' });
  if (loading === 'email-account') {
    jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: false });
    jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), activity: 'loading', busy: true });
    setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, id: 'jup', name: 'Jup', seekerExclusive: false }] } });
  }
  if (loading === 'session') {
    jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: false, playerId: '', sessionToken: '', error: null });
    setShop({ ready: false }); setPack({ ready: false });
  }
  await mount();
  const shortcut = tree.root.findAllByProps({ testID: 'shop-account-shortcut' }).find(node => typeof node.props.onPress === 'function')!;
  expect(shortcut.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(text('Preparing shop...')).toBe(true);
  expect(text(loading === 'session' ? 'Getting your shop ready...' : loading.endsWith('recovery') ? 'Checking saved purchases...' : 'Restoring your account...')).toBe(true);
  const buy = button(loading === 'email-account' ? 'Buy Jup' : 'Buy Seeker fighter');
  expect(buy.props.disabled).toBe(true); expect(buy.props.busy).toBe(true);
  await press('Preparing shop'); await press(loading === 'email-account' ? 'Buy Jup' : 'Buy Seeker fighter'); await press('Buy fighter pack');
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  expect(visibleModals()).toHaveLength(0);
  expect(button('Back from figure shop').props.disabled).toBeFalsy();
  await press('Open your army'); expect(navigate).toHaveBeenCalledWith('Army', undefined);
  external(); setShop({}); setPack({});
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), activity: 'idle', busy: false });
  jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: true, playerId: 'player', sessionToken: 'token', error: null });
  await updateScreen();
  expect(text('Preparing shop...')).toBe(false); expect(button('Buy Seeker fighter').props.disabled).toBe(false);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled(); expect(signShopTransaction).not.toHaveBeenCalled();
});

test.each(['session', 'figure-recovery', 'pack-recovery'] as const)('shop entry %s failure shows recovery instead of an endless preparation spinner', async failure => {
  external();
  const error = 'Could not restore your purchase. Try again.';
  if (failure === 'session') {
    jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: false, playerId: '', sessionToken: '', error });
    setShop({ ready: false }); setPack({ ready: false });
  }
  if (failure === 'figure-recovery') setShop({ ready: false, error });
  if (failure === 'pack-recovery') setPack({ ready: false, error });
  await mount();
  expect(text('Preparing shop...')).toBe(false);
  expect(tree.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0);
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
});

test('normal catalog refresh and a saved purchase do not turn the account shortcut back into startup loading', async () => {
  external(); setShop({ hasPurchase: true, busy: true, order }); await mount();
  expect(text('Preparing shop...')).toBe(false);
  expect(button('Choose purchase wallet')).toBeDefined();
});

test('saved purchase recovery waits for startup readiness instead of opening a silent wallet continuation', async () => {
  external(); setShop({ hasPurchase: true, order }); setPack({ ready: false }); await mount();
  expect(button('Continue purchase').props.accessibilityState.busy).toBe(true); expect(button('Continue purchase').props.disabled).toBe(true);
  await press('Continue purchase'); expect(visibleModals()).toHaveLength(0);
  expect(shop.confirm).not.toHaveBeenCalled();
  setPack({}); await updateScreen(); await press('Continue purchase');
  expect(purchaseModal('figure')).toBeDefined(); expect(shop.confirm).not.toHaveBeenCalled();
});

test('an unresolved pack catalog has no card or availability button during startup', async () => {
  external(); setShop({ ready: false }); setPack({ catalog: null }); await mount();
  expect(tree.root.findByType(ShopPack).children).toHaveLength(0);
  expect(text('Fighter pack')).toBe(false);
  expect(button('Check pack availability')).toBeUndefined();
  expect(button('Buy fighter pack')).toBeUndefined();
  expect(text('Preparing shop...')).toBe(true);
  setShop({}); await updateScreen();
  expect(text('Fighter pack')).toBe(false);
  expect(button('Buy Seeker fighter').props.disabled).toBe(false);
  expect(pack.prepare).not.toHaveBeenCalled();
});

test.each([null, 'Pack catalog unavailable'])('a paused pack is completely hidden, including a catalog error: %s', async error => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: false }, error }); await mount();
  expect(tree.root.findByType(ShopPack).children).toHaveLength(0);
  expect(text('Fighter pack')).toBe(false);
  expect(text('One pack. One surprise fighter. Available on every device.')).toBe(false);
  expect(text('Packs coming soon')).toBe(false);
  expect(button('Buy fighter pack')).toBeUndefined();
  expect(button('Check pack availability')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(false);
  expect(visibleModals()).toHaveLength(0);
  expect(pack.prepare).not.toHaveBeenCalled();
  setPack({ catalog: { ...INITIAL_PACK, available: true } }); await updateScreen();
  expect(text('Fighter pack')).toBe(true);
  expect(button('Buy fighter pack').props.disabled).toBe(false);
});

test('a paid pack remains recoverable while its product card is hidden', async () => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: false }, hasPurchase: true,
    signingStarted: true, order: { ...packOrder, status: 'waiting-result' } });
  await mountRecovery();
  expect(text('Fighter pack')).toBe(false);
  expect(button('Buy fighter pack')).toBeUndefined();
  expect(button('Check pack status')).toBeDefined();
  await press('Check pack status');
  expect(pack.checkStatus).toHaveBeenCalledTimes(1);
  setPack({ catalog: { ...INITIAL_PACK, available: false }, hasPurchase: true,
    signingStarted: true, order: { ...packOrder, status: 'confirmed', result: 'bonk' } });
  await updateScreen(); await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: packOrder.asset });
  expect(pack.prepare).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});

test('quantity selection changes the total and one explicit Buy passes the selected count', async () => {
  const figure = { ...fig2, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.fig2 };
  external(); setShop({ catalog: { ...shop.catalog, figures: [figure], maxFigureQuantity: 3 } }); await mount();
  expect(button('Fewer Seeker fighter figures').props.disabled).toBe(true);
  await press('More Seeker fighter figures'); expect(text('2 SKR')).toBe(true); expect(text('Buy 2 figures')).toBe(true);
  await press('More Seeker fighter figures'); expect(text('3 SKR')).toBe(true); expect(button('More Seeker fighter figures').props.disabled).toBe(true);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(signShopTransaction).not.toHaveBeenCalled();
  await press('Buy 3 Seeker fighter figures');
  expect(shop.prepare).toHaveBeenCalledWith('fig2', buyer, proveSeekerWallet, expect.any(Function), 3);
  expect(shop.prepare).toHaveBeenCalledTimes(1);
});
test('quantity controls lock for a saved purchase and are absent on exclusive and old-server cards', async () => {
  setShop({ catalog: { ...shop.catalog, maxFigureQuantity: 3 } }); await mount();
  expect(button('More Seeker fighter figures')).toBeUndefined();
  external(); await updateScreen(); expect(button('More Seeker fighter figures')).toBeDefined();
  setShop({ catalog: { ...shop.catalog, maxFigureQuantity: 3 }, hasPurchase: true, order, signingStarted: true }); await updateScreen();
  expect(button('More Seeker fighter figures').props.disabled).toBe(true);
  setShop({ catalog: shop.catalog }); await updateScreen(); expect(button('More Seeker fighter figures')).toBeUndefined();
});
test('bulk reward shows quantity and keeps all collectible IDs while Army opens the first exact asset', async () => {
  external(); const assets = [order.asset, 'asset22222222222222222222222222222', 'asset33333333333333333333333333333'];
  setShop({ hasPurchase: true, order: { ...order, quantity: 3, assets, status: 'confirmed' }, signingStarted: true });
  await mount(); await press('Buy Seeker fighter'); // A fresh action may open a terminal receipt in this mocked screen.
  await press('Close figure purchase popup');
  setShop({ hasPurchase: true, order: { ...order, quantity: 3, assets, status: 'submitted' }, signingStarted: true }); await updateScreen();
  await press('Continue purchase');
  setShop({ hasPurchase: true, order: { ...order, quantity: 3, assets, status: 'confirmed' }, signingStarted: true }); await updateScreen();
  expect(text('Seeker fighter x3')).toBe(true); expectSimplePurchase('figure');
  await press('Add to your army'); expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: assets[0] });
  expect(jest.mocked(useShop).mock.results.at(-1)!.value.order?.assets).toEqual(assets);
});

test.each(['figure', 'pack'] as const)('asynchronous restored %s shortfall never opens checkout on shop entry', async kind => {
  external(); await mount();
  const buyWithSol = jest.fn();
  const saved = { hasPurchase: true, purchaseBuyer: buyer, order: null, error: 'Not enough ORE to complete this purchase.', fundingRequired: { symbol: 'ORE' }, buyWithSol };
  if (kind === 'figure') setShop(saved); else setPack(saved);
  await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(buyWithSol).not.toHaveBeenCalled(); expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
  await press('Continue purchase');
  expect(purchaseModal(kind)).toBeDefined();
  expect(button('Buy with SOL')).toBeDefined();
  expect(purchaseModal(kind).findByType(StatusBanner).props.tone).toBe('warning');
  expect(buyWithSol).not.toHaveBeenCalled(); expect(signShopTransaction).not.toHaveBeenCalled();
});

test.each(['ORE', 'BONK', 'JUP', 'SKR'])('%s shortfall uses a warning while an unrelated purchase failure remains an error', async symbol => {
  external(); setShop({ hasPurchase: true, purchaseBuyer: buyer, error: `Not enough ${symbol}`, fundingRequired: { symbol } });
  await mountRecovery();
  expect(purchaseModal('figure').findByType(StatusBanner).props.tone).toBe('warning');
  expect(button('Buy with SOL')).toBeDefined();
  setShop({ hasPurchase: true, purchaseBuyer: buyer, error: 'Network unavailable', fundingRequired: null });
  await updateScreen();
  expect(purchaseModal('figure').findByType(StatusBanner).props.tone).toBe('error');
  expect(button('Buy with SOL')).toBeUndefined();
});

test('figure Buy with SOL goes directly to wallet signing without another quote confirmation', async () => {
  const buyWithSol = jest.fn(async sign => { await sign(order); });
  jest.mocked(signShopTransaction).mockResolvedValueOnce('AQ==');
  external();
  setShop({ hasPurchase: true, purchaseBuyer: buyer, error: 'Not enough ORE', fundingRequired: { symbol: 'ORE' }, buyWithSol });
  await mountRecovery(); purchaseModal('figure');
  expect(button('Buy with SOL')).toBeDefined();
  await press('Buy with SOL');
  expect(buyWithSol).toHaveBeenCalledWith(expect.any(Function));
  expect(signShopTransaction).toHaveBeenCalledWith(order);
  expect(shop.confirm).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  setShop({ hasPurchase: true, purchaseBuyer: buyer, error: 'Not enough ORE', fundingRequired: { symbol: 'ORE' }, buyWithSol, busy: true });
  await updateScreen(); expect(button('Buy with SOL').props.disabled).toBe(true);
});

test('pack Buy with SOL directly signs the saved pack, not a new purchase', async () => {
  const buyWithSol = jest.fn(async sign => { await sign(packOrder); });
  jest.mocked(signShopTransaction).mockResolvedValueOnce('AQ==');
  external(); setPack({ hasPurchase: true, purchaseBuyer: buyer, fundingRequired: { symbol: 'SKR' }, error: 'Not enough SKR', buyWithSol });
  await mountRecovery(); purchaseModal('pack'); await press('Buy with SOL');
  expect(buyWithSol).toHaveBeenCalledWith(expect.any(Function));
  expect(signShopTransaction).toHaveBeenCalledWith(packOrder);
  expect(pack.prepare).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});

test.each(['figure', 'pack'] as const)('%s Buy with SOL keeps one popup through preparation, signing and sending', async kind => {
  external();
  let prepared!: () => void, signed!: (value: string) => void, sent!: () => void;
  const prepareWait = new Promise<void>(resolve => { prepared = resolve; });
  const signWait = new Promise<string>(resolve => { signed = resolve; });
  const sendWait = new Promise<void>(resolve => { sent = resolve; });
  const buyWithSol = jest.fn(async sign => { await prepareWait; await sign(kind === 'figure' ? order : packOrder); await sendWait; });
  jest.mocked(signShopTransaction).mockImplementationOnce(() => signWait);
  const pending = { hasPurchase: true, purchaseBuyer: buyer, error: 'Not enough ORE', fundingRequired: { symbol: 'ORE' }, buyWithSol };
  if (kind === 'figure') setShop(pending); else setPack(pending);
  await mountRecovery();
  const host = purchaseModal(kind), trigger = button('Buy with SOL');
  await Renderer.act(() => { trigger.props.onPress(); trigger.props.onPress(); });
  expect(buyWithSol).toHaveBeenCalledTimes(1);
  expect(purchaseModal(kind)).toBe(host);
  expect(host.props.visible).toBe(true);
  expect(text('Preparing purchase')).toBe(true);
  expect(text('Preparing your SOL payment. Your wallet will open for approval.')).toBe(true);
  expect(host.findAllByType(ActivityIndicator)).toHaveLength(1);
  expectSimplePurchase(kind);
  expect(button('Buy with SOL')).toBeUndefined();
  expect(button('Confirm purchase')).toBeUndefined();
  expect(signShopTransaction).not.toHaveBeenCalled();
  await Renderer.act(async () => prepared());
  expect(purchaseModal(kind)).toBe(host);
  expect(text('Opening your wallet')).toBe(true);
  expect(signShopTransaction).toHaveBeenCalledTimes(1);
  expect(text('PURCHASE COMPLETE')).toBe(false);
  await Renderer.act(async () => signed('AQ=='));
  expect(purchaseModal(kind)).toBe(host);
  expect(text('Sending purchase')).toBe(true);
  expect(text('Approval received. Sending your purchase - please wait.')).toBe(true);
  expect(button('Done')).toBeUndefined();
  if (kind === 'figure') setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'submitted' } });
  else setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'submitted' } });
  await Renderer.act(async () => sent()); await updateScreen();
  expect(purchaseModal(kind)).toBe(host);
  expect(host.findAllByProps({ testID: 'purchase-handoff' })).toHaveLength(0);
  expect(signShopTransaction).toHaveBeenCalledTimes(1);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
  expect(shop.dismiss).not.toHaveBeenCalled(); expect(pack.dismiss).not.toHaveBeenCalled();
});

test.each(['figure', 'pack'] as const)('closing %s preparation pauses delayed signing without losing its recovery popup', async kind => {
  external(); let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  const buyWithSol = jest.fn(async sign => { await wait; await sign(kind === 'figure' ? order : packOrder); });
  const saved = { hasPurchase: true, purchaseBuyer: buyer, fundingRequired: { symbol: 'ORE' }, buyWithSol };
  if (kind === 'figure') setShop(saved); else setPack(saved);
  await mountRecovery(); await press('Buy with SOL');
  await Renderer.act(() => purchaseModal(kind).props.onRequestClose());
  expect(visibleModals()).toHaveLength(0);
  await Renderer.act(async () => finish());
  expect(visibleModals()).toHaveLength(0);
  expect(signShopTransaction).not.toHaveBeenCalled();
  expect(buyWithSol).toHaveBeenCalledTimes(1);
  expect(shop.dismiss).not.toHaveBeenCalled(); expect(pack.dismiss).not.toHaveBeenCalled();
  await press('Continue purchase');
  expect(purchaseModal(kind)).toBeDefined();
  expect(buyWithSol).toHaveBeenCalledTimes(1);
});

test.each(['figure', 'pack'] as const)('%s wallet rejection returns to recovery without auto-retry or false success', async kind => {
  external();
  jest.mocked(signShopTransaction).mockRejectedValueOnce(new Error('User rejected'));
  const buyWithSol = jest.fn(async sign => { await sign(kind === 'figure' ? order : packOrder); });
  const saved = { hasPurchase: true, purchaseBuyer: buyer, fundingRequired: { symbol: 'ORE' }, buyWithSol };
  if (kind === 'figure') setShop(saved); else setPack(saved);
  await mountRecovery(); const host = purchaseModal(kind);
  await press('Buy with SOL');
  expect(purchaseModal(kind)).toBe(host);
  expect(host.findAllByProps({ testID: 'purchase-handoff' })).toHaveLength(0);
  expect(text('PURCHASE COMPLETE')).toBe(false); expect(button('Done')).toBeUndefined();
  expect(signShopTransaction).toHaveBeenCalledTimes(1); expect(buyWithSol).toHaveBeenCalledTimes(1);
  await updateScreen();
  expect(signShopTransaction).toHaveBeenCalledTimes(1);
  expect(shop.dismiss).not.toHaveBeenCalled(); expect(pack.dismiss).not.toHaveBeenCalled();
});

test.each(['ios', 'android'] as const)('%s email approval shows purchase progress without promising to open an external wallet', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  let finish!: (value: string) => void;
  const sign = jest.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, signShopTransaction: sign });
  setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, id: 'jup', name: 'Jup', seekerExclusive: false }] } });
  shop.prepare.mockImplementationOnce(async (_id, _buyer, _proof, approve) => { await approve({ ...order, figureId: 'jup' }); });
  await mount(); await press('Buy Jup');
  expect(text('Approving purchase')).toBe(true);
  expect(purchaseModal('figure').findAllByType(Text).map(node => String(node.props.children)).join(' ')).not.toMatch(/wallet|privy/i);
  expect(sign).toHaveBeenCalledTimes(1); expect(signShopTransaction).not.toHaveBeenCalled();
  await Renderer.act(async () => finish('AQ=='));
});

test.each(['figure', 'pack'] as const)('%s SOL preparation failure stays visible and never opens signing', async kind => {
  external();
  const buyWithSol = jest.fn().mockRejectedValue(new Error('Could not connect. Try again.'));
  const pending = { hasPurchase: true, purchaseBuyer: buyer, fundingRequired: { symbol: 'ORE' }, buyWithSol };
  if (kind === 'figure') setShop(pending); else setPack(pending);
  await mountRecovery(); const host = purchaseModal(kind);
  await press('Buy with SOL');
  if (kind === 'figure') setShop({ ...pending, error: 'Could not connect. Try again.' });
  else setPack({ ...pending, error: 'Could not connect. Try again.' });
  await updateScreen();
  expect(purchaseModal(kind)).toBe(host);
  expect(text('Could not connect. Try again.')).toBe(true);
  expect(signShopTransaction).not.toHaveBeenCalled();
  expect(buyWithSol).toHaveBeenCalledTimes(1);
  expect(shop.dismiss).not.toHaveBeenCalled(); expect(pack.dismiss).not.toHaveBeenCalled();
});
const packOrder = { ...order, payment: PACK_PAYMENT, drops: INITIAL_PACK.drops, receipt: order.asset, edition: order.asset, version: 1, result: null, randomness: null };

test.each(['ios', 'android'] as const)('ORE pack shows all three chances and its confirmed reward on %s', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  const drops = [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }];
  setPack({ catalog: { ...INITIAL_PACK, available: true, version: 2, drops } });
  await mount();
  for (const label of ['Jup', 'BONK', 'ORE', '40% chance', '20% chance']) expect(text(label)).toBe(true);
  setPack({ catalog: { ...INITIAL_PACK, available: true, version: 2, drops }, hasPurchase: true,
    order: { ...packOrder, version: 2, drops, status: 'submitted' } });
  await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await press('Continue purchase');
  setPack({ catalog: { ...INITIAL_PACK, available: true, version: 2, drops }, hasPurchase: true,
    order: { ...packOrder, version: 2, drops, status: 'confirmed', result: 'ore' } });
  await updateScreen();
  expect(visibleModals()).toHaveLength(1);
  const modal = purchaseModal('pack');
  expect(modal.findAllByType(Text).some(node => node.props.children === 'ORE')).toBe(true);
  expect(button('Done')).toBeDefined();
  expect(pack.prepare).not.toHaveBeenCalled();
});

test.each(['ios','android'] as const)('packs offer the same SKR price and 50/50 drops on non-Seeker %s, using email signing',async os=>{
  jest.replaceProperty(Platform,'OS',os);
  jest.mocked(usePackShop).mockReturnValue({...pack,catalog:{...INITIAL_PACK,available:true}} as unknown as ReturnType<typeof usePackShop>);
  await mount();expect(text('Jup')).toBe(true);expect(text('BONK')).toBe(true);expect(text('50% chance')).toBe(true);
  await press('Buy fighter pack');expect(tree.root.findByType(Modal).props.visible).toBe(true);expect(proveSeekerWallet).not.toHaveBeenCalled();
  const signer=jest.fn();jest.mocked(usePrivyWallet).mockReturnValue({...jest.mocked(usePrivyWallet)(),address:buyer,signShopTransaction:signer});
  jest.mocked(usePackShop).mockReturnValue({...pack,hasPurchase:true,order:{...order,payment:PACK_PAYMENT,drops:INITIAL_PACK.drops,receipt:order.asset,edition:order.asset,version:1,result:null,randomness:null}} as unknown as ReturnType<typeof usePackShop>);
  await Renderer.act(()=>tree.update(<ShopScreen navigation={{navigate,goBack} as never} route={{params:undefined} as never}/>));
  await press('Back to figures');
  expect(visibleModals()).toHaveLength(0);
  await press('Continue purchase');
  expect(visibleModals()).toHaveLength(1);
  pack.confirm.mockImplementationOnce(async sign => { await sign(packOrder); });
  await press('Continue in wallet'); expect(pack.confirm).toHaveBeenCalledWith(expect.any(Function)); expect(signer).toHaveBeenCalledWith(packOrder);
});

test.each(['bonk', 'jup', 'ore'] as const)('%s retains its catalog price without a submitted receipt breakdown or Seeker proof', async id => {
  external();
  const figure: ShopFigure = { ...fig2, ...FIGURES.find(f => f.id === id)!, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS[id] };
  setShop({ catalog: { ...shop.catalog, figures: [figure] } });
  await mount();
  expect(text(figurePaymentPrice(figure, 'mainnet-beta'))).toBe(true);
  await press(`Buy ${figure.name}`);
  expect(shop.prepare).toHaveBeenCalledWith(id, buyer, undefined, expect.any(Function));
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted', figureId: id, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS[id] } });
  await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params: undefined } as never} />));
  expectSimplePurchase('figure');
  expect(text(`${figurePaymentPrice(figure, 'mainnet-beta')} + 0.001005 SOL`)).toBe(false);
  expect(text('Processing your purchase… You can leave and check back.')).toBe(true);
  expect(text('0 SOL')).toBe(false);
});

test.each(['ios', 'android'] as const)('non-Seeker %s only offers Register and email OTP, including when an old external address exists', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), address: buyer });
  await mount();
  expect(button('Register')).toBeDefined();
  expect(text('Connect your wallet')).toBe(false);
  await press('Register');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(tree.root.findAllByType(TextInput).some(node => node.props.accessibilityLabel === 'Email address')).toBe(true);
  expect(button('Connect your wallet')).toBeUndefined();
  expect(button('Use this wallet')).toBeUndefined();
  expect(text(buyer)).toBe(false);
  expect(tree.root.findAllByType(Text).some(node => /privy/i.test(String(node.props.children)))).toBe(false);
  expect(connect).not.toHaveBeenCalled();
});

test('Register navigation opens email sign-in without a second tap', async () => {
  await mount({ signIn: true });
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(button('Send sign-in code')).toBeDefined();
  expect(button('Connect your wallet')).toBeUndefined();
  expect(sendCode).not.toHaveBeenCalled();
});

test('Seeker connects directly without an account chooser or email form', async () => {
  external(null); await mount();
  expect(text('Connect your wallet')).toBe(true);
  await press('Connect your wallet');
  expect(connect).toHaveBeenCalledTimes(1);
  expect(visibleModals()).toHaveLength(0);
  expect(button('Send sign-in code')).toBeUndefined();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(tree.root.findAllByType(Text).some(node => /privy/i.test(String(node.props.children)))).toBe(false);
});

test('email account sign-out clears the binding and paid slots', async () => {
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer });
  await mount(); await press('Manage account'); await press('Sign out');
  expect(shop.clearWallet).toHaveBeenCalledTimes(1);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(saveFigureSlots).toHaveBeenCalledWith(Array(14).fill(null));
  expect(connect).not.toHaveBeenCalled();
});

test('a saved email-wallet purchase still requires explicit approval with its exact signer', async () => {
  const sign = jest.fn();
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, status: 'authenticated', signShopTransaction: sign });
  setShop({ hasPurchase: true, order });
  await mountRecovery();
  expect(shop.confirm).not.toHaveBeenCalled();
  shop.confirm.mockImplementationOnce(async approve => { await approve(order); });
  await press('Continue in wallet');
  expect(shop.confirm).toHaveBeenCalledWith(expect.any(Function)); expect(sign).toHaveBeenCalledWith(order);
  expect(connect).not.toHaveBeenCalled();
});

test('shows the real catalog price without a free-starter promotion, wallet wall or duplicate header', async () => {
  external(); await mount();
  expect(text('0.01 SOL')).toBe(true);
  expect(text('RIPSY 001 is always free')).toBe(false);
  expect(text('Fills every unused army slot. No mint needed.')).toBe(false);
  expect(button('Use free RIPSY 001 in your army')).toBeUndefined();
  expect(button('Buy RIPSY 001')).toBeUndefined();
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'shop-header' }).props.style).paddingTop).toBeGreaterThanOrEqual(8);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
  await press('Open your army');
  expect(navigate).toHaveBeenCalledWith('Army', undefined);
});

test('shop cards display fighter names without FIG/figure-number badges', async () => {
  const figures = FIGURES.filter(f => f.id !== 'fig1').map(f => ({ ...fig2, ...f, priceLamports: '10000000', available: true }));
  setShop({ catalog: { ...shop.catalog, figures } });
  await mount();
  const copy = tree.root.findAllByType(Text).flatMap(node => [node.props.children].flat(Infinity)).filter(value => typeof value === 'string').join(' ');
  expect(copy).not.toMatch(/\b(?:FIG|Figure)\s+0?\d+\b/i);
  for (const figure of figures) {
    expect(tree.root.findAllByType(Text).some(node => node.props.accessibilityRole === 'header' && node.props.children === figure.name)).toBe(true);
    expect(tree.root.findAllByProps({ accessibilityLabel: figure.name + ' preview' }).length).toBeGreaterThan(0);
  }
  expect(text('SEEKER EXCLUSIVE')).toBe(true);
});
test('Solana Mobile Exclusive on iOS opens the store browser, never a wallet modal or mint', async () => {
  await mount(); await press('Solana Mobile Exclusive');
  expect(text('Solana Mobile Exclusive')).toBe(true);
  expect(Linking.openURL).toHaveBeenCalledWith('https://store.solanamobile.com/');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});
test.each(['figure', 'pack'] as const)('new %s buy shows wallet handoff progress without another quote confirmation', async kind => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  jest.mocked(signShopTransaction).mockImplementationOnce(async () => { await wait; return 'AQ=='; });
  if (kind === 'figure') shop.prepare.mockImplementationOnce(async (_id, _buyer, _proof, sign) => { await sign(order); });
  else pack.prepare.mockImplementationOnce(async (_buyer, sign) => { await sign(packOrder); });
  await mount(); await press(kind === 'figure' ? 'Buy Seeker fighter' : 'Buy fighter pack');
  expect(signShopTransaction).toHaveBeenCalledWith(kind === 'figure' ? order : packOrder);
  expect(visibleModals()).toHaveLength(1);
  expect(text('Opening your wallet')).toBe(true);
  expect(button('Continue in wallet')).toBeUndefined();
  expect(button('Confirm purchase')).toBeUndefined();
  expect(purchaseModal(kind).findAllByType(ActivityIndicator)).toHaveLength(1);
  await Renderer.act(async () => finish());
  expect(shop.confirm).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});
test('email purchase goes directly to its own signer, never to the external wallet', async () => {
  const sign = jest.fn().mockResolvedValue('AQ==');
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, signShopTransaction: sign });
  setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, id: 'jup', variant: 4, name: 'Jup', seekerExclusive: false }] } });
  shop.prepare.mockImplementationOnce(async (_id, _buyer, _proof, signer) => { await signer({ ...order, figureId: 'jup' }); });
  await mount(); await press('Buy Jup');
  expect(sign).toHaveBeenCalledTimes(1); expect(signShopTransaction).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});
test.each(['account-changed', 'background', 'unmounted'] as const)('delayed preparation does not open a wallet after %s', async reason => {
  external(); await mount(); await press('Buy Seeker fighter');
  const signer = shop.prepare.mock.calls[0]![3];
  if (reason === 'account-changed') { external('other1111111111111111111111111111'); await updateScreen(); }
  if (reason === 'background') jest.replaceProperty(AppState, 'currentState', 'background');
  if (reason === 'unmounted') await Renderer.act(() => tree.unmount());
  await expect(signer(order)).rejects.toThrow(reason === 'account-changed' ? 'Reconnect' : 'Return to the shop');
  expect(signShopTransaction).not.toHaveBeenCalled();
});
test('simultaneous figure/pack taps cannot redirect the active purchase popup', async () => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  let finish!: () => void;
  shop.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount(); const figure = button('Buy Seeker fighter'), packBuy = button('Buy fighter pack');
  await Renderer.act(async () => { figure.props.onPress(); packBuy.props.onPress(); });
  expect(shop.prepare).toHaveBeenCalledTimes(1); expect(pack.prepare).not.toHaveBeenCalled();
  await Renderer.act(async () => finish()); expect(purchaseModal('figure')).toBeDefined();
});
test('Seeker buy supplies a signer after the existing eligibility proof', async () => {
  external(); await mount(); await press('Buy Seeker fighter');
  expect(shop.prepare).toHaveBeenCalledWith('fig2', buyer, proveSeekerWallet, expect.any(Function));
  expect(shop.confirm).not.toHaveBeenCalled();
});
test('Seeker catalog retains SKR pricing while current and legacy submitted receipts omit price details', async () => {
  external();
  const figure = { ...fig2, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.fig2 };
  const catalog = { ...shop.catalog, figures: [figure] };
  setShop({ catalog }); await mount();
  expect(text('1 SKR')).toBe(true);
  await press('Buy Seeker fighter');
  expect(shop.prepare).toHaveBeenCalledWith('fig2', buyer, proveSeekerWallet, expect.any(Function));
  expect(shop.confirm).not.toHaveBeenCalled();
  setShop({ catalog, hasPurchase: true, order: { ...order, status: 'submitted', priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.fig2 } });
  await updateScreen();
  let modal = purchaseModal('figure');
  expectSimplePurchase('figure');
  expect(modal.findAllByType(Text).some(node => node.props.children === '1 SKR')).toBe(false);
  expect(modal.findAllByType(Text).some(node => node.props.children === '1 SKR + 0.001005 SOL')).toBe(false);
  expect(text('1 SKR')).toBe(true);
  setShop({ catalog, hasPurchase: true, order: { ...order, status: 'submitted' } }); await updateScreen();
  modal = purchaseModal('figure');
  expectSimplePurchase('figure');
  expect(modal.findAllByType(Text).some(node => node.props.children === '0.01 SOL')).toBe(false);
  expect(modal.findAllByType(Text).some(node => node.props.children === '0.011005 SOL')).toBe(false);
  expect(modal.findAllByType(Text).some(node => node.props.children === '1 SKR')).toBe(false);
});
test('an embedded wallet cannot bypass Seeker fighter Seeker eligibility', async () => {
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer });
  await mount(); await press('Solana Mobile Exclusive');
  expect(Linking.openURL).toHaveBeenCalledWith('https://store.solanamobile.com/');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(shop.prepare).not.toHaveBeenCalled();
});

test('exclusive store action uses the backend referral URL exactly', async () => {
  const referral = 'https://store.solanamobile.com/?ref=ripsy&utm_source=app';
  setShop({ catalog: { ...shop.catalog, solanaMobileStoreUrl: referral } });
  await mount(); await press('Solana Mobile Exclusive');
  expect(Linking.openURL).toHaveBeenCalledWith(referral);
  expect(shop.prepare).not.toHaveBeenCalled();
});

test('store browsing stays available when minting is disabled or a purchase is pending', async () => {
  setShop({ ready: false, busy: true, hasPurchase: true, catalog: { ...shop.catalog, figures: [{ ...fig2, available: false, priceLamports: null }] } });
  await mount();
  expect(button('Solana Mobile Exclusive').props.disabled).toBe(false);
  expect(button('Solana Mobile Exclusive').props.busy).toBe(false);
  await press('Solana Mobile Exclusive');
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});

test('browser opening failure is visible and the exclusive button can retry', async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No handler'));
  await mount(); await press('Solana Mobile Exclusive');
  expect(text('Could not open the Solana Mobile store. Please try again.')).toBe(true);
  await press('Solana Mobile Exclusive');
  expect(Linking.openURL).toHaveBeenCalledTimes(2);
  expect(text('Could not open the Solana Mobile store. Please try again.')).toBe(false);
  expect(shop.prepare).not.toHaveBeenCalled();
});
test('disconnected Seeker shoppers can connect without preparing a purchase', async () => {
  external(null); await mount(); await press('Connect your wallet');
  expect(connect).toHaveBeenCalledTimes(1); expect(shop.prepare).not.toHaveBeenCalled();
});
test.each(['Buy Seeker fighter', 'Buy fighter pack'])('%s connects directly on Seeker and still needs explicit purchase review afterwards', async label => {
  external(null); setPack({ catalog: { ...INITIAL_PACK, available: true } }); await mount();
  await press(label);
  expect(connect).toHaveBeenCalledTimes(1); expect(visibleModals()).toHaveLength(0);
  expect(text('Your purchase account')).toBe(false); expect(button('Send sign-in code')).toBeUndefined();
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
  external(); await updateScreen(); await press(label);
  if (label === 'Buy Seeker fighter') expect(shop.prepare).toHaveBeenCalledWith('fig2', buyer, proveSeekerWallet, expect.any(Function));
  else expect(pack.prepare).toHaveBeenCalledWith(buyer, expect.any(Function));
  expect(shop.confirm).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});
test('direct Seeker connection deduplicates taps, shows progress and allows retry after failure', async () => {
  external(null); let reject!: (error: Error) => void;
  connect.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await mount(); const trigger = button('Connect your wallet');
  await Renderer.act(async () => { trigger.props.onPress(); trigger.props.onPress(); });
  expect(connect).toHaveBeenCalledTimes(1); expect(visibleModals()).toHaveLength(0);
  expect(button('Connect your wallet').props.disabled).toBe(true);
  expect(button('Buy Seeker fighter').props.busy).toBe(true);
  await Renderer.act(async () => reject(new Error('Wallet connection cancelled. Please try again.')));
  expect(text('Connection cancelled.')).toBe(true);
  expect(button('Connect your wallet').props.disabled).toBe(false);
  await press('Connect your wallet'); expect(connect).toHaveBeenCalledTimes(2);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
});
test('Seeker pack recovery connects directly and keeps the exact saved purchase', async () => {
  external(null); setPack({ hasPurchase: true, signingStarted: true, order: packOrder });
  await mountRecovery(); const host = purchaseModal('pack'); await press('Sign in to purchase account');
  expect(connect).toHaveBeenCalledTimes(1); expect(purchaseModal('pack')).toBe(host);
  expect(button('Send sign-in code')).toBeUndefined(); expect(pack.prepare).not.toHaveBeenCalled();
  external(); await updateScreen(); await press('Continue in wallet');
  expect(pack.confirm).toHaveBeenCalledWith(expect.any(Function)); expect(pack.dismiss).not.toHaveBeenCalled();
});
test('restored prepared purchase offers wallet continuation without a second quote confirmation', async () => {
  external(); setShop({ hasPurchase: true, order }); await mountRecovery();
  expect(text('0.001005 SOL')).toBe(false); expect(text('0.011005 SOL')).toBe(false);
  expect(text(order.buyer)).toBe(false); expect(text(order.treasury)).toBe(false);
  expectSimplePurchase('figure');
  expect(button('Payment details')).toBeUndefined();
  // Native View cannot render literal JSX strings (including escaped newlines).
  expect(tree.root.findAllByType(View).flatMap(node => node.children.filter(child => typeof child === 'string'))).toEqual([]);
  expect(shop.confirm).not.toHaveBeenCalled();
  await press('Continue in wallet'); expect(shop.confirm).toHaveBeenCalledWith(expect.any(Function));
});
test('restored signing intent cannot be canceled or replaced; reconnect remains available', async () => {
  external(null); setShop({ hasPurchase: true, signingStarted: true, order }); await mountRecovery();
  expect(button('Cancel purchase')).toBeUndefined(); expect(button('Check purchase status')).toBeDefined();
  expect(button('Continue in wallet').props.disabled).toBe(true);
  await press('Reconnect wallet'); expect(connect).toHaveBeenCalledTimes(1);
  expect(button('Send sign-in code')).toBeUndefined(); expect(purchaseModal('figure')).toBeDefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
});
test('confirmed mint opens Army with the exact new Core asset id', async () => {
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'submitted' } });
  await mountRecovery();
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'confirmed', signature: 'sig' } }); await updateScreen();
  expect(button('Done')).toBeDefined(); expect(button('Continue in wallet')).toBeUndefined();
  await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: order.asset });
  expect(visibleModals()).toHaveLength(0);
});

test('new figure buy keeps visible preparation progress and deduplicates taps', async () => {
  external(); let finish!: () => void;
  shop.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount(); const trigger = button('Buy Seeker fighter');
  await Renderer.act(async () => { trigger.props.onPress(); trigger.props.onPress(); });
  expect(shop.prepare).toHaveBeenCalledTimes(1);
  setShop({ hasPurchase: true, busy: true, order }); await updateScreen();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('figure').findAllByProps({ testID: 'purchase-handoff' }).length).toBeGreaterThan(0);
  expect(text('Preparing purchase')).toBe(true);
  expect(button('Continue in wallet')).toBeUndefined();
  await Renderer.act(async () => finish());
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } }); await updateScreen();
  expect(purchaseModal('figure')).toBeDefined();
  expect(shop.confirm).not.toHaveBeenCalled();
});

test.each(['prepared', 'submitted'] as const)('restored unfinished figure %s opens only through Continue purchase', async status => {
  setShop({ hasPurchase: true, signingStarted: status !== 'prepared', order: { ...order, status } });
  await mountRecovery();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('figure').findAllByType(Text).some(node => node.props.children === (status === 'submitted' ? 'Processing purchase' : 'Continue your purchase'))).toBe(true);
  expectSimplePurchase('figure');
  if (status === 'submitted') expect(purchaseModal('figure').findAllByType(ActivityIndicator)).toHaveLength(1);
  else expect(button('Continue in wallet')).toBeDefined();
});

test.each(['confirmed', 'failed', 'expired'] as const)('restored terminal figure %s stays closed, including after re-entering Shop', async status => {
  external();
  const saved = { hasPurchase: true, signingStarted: true, order: { ...order, status } };
  await mount();
  // Durable storage resolves asynchronously after the shop has mounted.
  setShop(saved); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('Continue purchase')).toBeUndefined();
  expect(button('View figure purchase')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(false);
  setShop({ ...saved, order: { ...saved.order } }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await Renderer.act(() => tree.unmount());
  await mount();
  expect(visibleModals()).toHaveLength(0);
  expect(shop.dismiss).not.toHaveBeenCalled();
  expect(shop.prepare).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
});

test.each(['confirmed', 'failed', 'expired'] as const)('restored terminal pack %s stays closed and no longer blocks Buy', async status => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  await mount();
  const saved = { catalog: { ...INITIAL_PACK, available: true }, hasPurchase: true, signingStarted: true, order: { ...packOrder, status, result: status === 'confirmed' ? 'bonk' : null } };
  setPack(saved); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('Continue purchase')).toBeUndefined();
  expect(button('View pack purchase')).toBeUndefined();
  expect(button('Buy fighter pack').props.disabled).toBe(false);
  expect(button('Buy Seeker fighter').props.disabled).toBe(false);
  await Renderer.act(() => tree.unmount()); await mount();
  expect(visibleModals()).toHaveLength(0);
  expect(pack.dismiss).not.toHaveBeenCalled();
  expect(pack.prepare).not.toHaveBeenCalled();
  expect(pack.confirm).not.toHaveBeenCalled();
});

test('an active figure purchase keeps its popup open when it completes', async () => {
  external(); await mount(); await press('Buy Seeker fighter');
  setShop({ hasPurchase: true, order }); await updateScreen();
  setShop({ hasPurchase: true, order: { ...order, status: 'confirmed' } }); await updateScreen();
  expect(purchaseModal('figure')).toBeDefined();
  expectSimplePurchase('figure');
  expect(button('Add to your army')).toBeDefined(); expect(button('Done')).toBeDefined();
  expect(text('Closing this popup keeps your purchase saved.')).toBe(false);
});

test.each(['fig2', 'bonk', 'jup', 'ore'] as const)('%s bought with SOL has a compact reward without altering the stored payment', async id => {
  external();
  const payment = FIGURE_TOKEN_PAYMENTS[id];
  if (!payment) throw new Error(`Missing token payment fixture for ${id}`);
  const figure: ShopFigure = { ...fig2, ...FIGURES.find(f => f.id === id)!, priceLamports: '0', tokenPayment: payment };
  const confirmed: MintOrder = Object.freeze({ ...order, status: 'confirmed', figureId: id, priceLamports: '0', tokenPayment: payment,
    solFunding: Object.freeze({ inputLamports: '1052065', outputMint: payment.mint, shortfall: payment.amount, minimumOutput: payment.amount, expectedOutput: payment.amount, slippageBps: 50 }) });
  const original = JSON.stringify(confirmed);
  const catalog = { ...shop.catalog, figures: [figure] };
  setShop({ catalog, hasPurchase: true, signingStarted: true, order: { ...confirmed, status: 'submitted' } });
  await mountRecovery();
  setShop({ catalog, hasPurchase: true, signingStarted: true, order: confirmed }); await updateScreen();
  expectSimplePurchase('figure');
  expect(purchaseModal('figure').findAllByType(Text).map(node => node.props.children)).toContain(figure.name);
  expect(text(figurePaymentPrice(figure, 'mainnet-beta'))).toBe(true);
  expect(button('Check purchase status')).toBeUndefined(); expect(button('Continue in wallet')).toBeUndefined();
  expect(button('Done')).toBeDefined();
  expect(JSON.stringify(confirmed)).toBe(original);
  await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: confirmed.asset });
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});

test('an active pack keeps its reward popup open when it completes', async () => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  await mount(); await press('Buy fighter pack');
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'waiting-result' } }); await updateScreen();
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'confirmed', result: 'bonk' } }); await updateScreen();
  expect(purchaseModal('pack')).toBeDefined();
  expectSimplePurchase('pack');
  expect(text('BONK')).toBe(true);
  expect(button('Add to your army')).toBeDefined(); expect(button('Done')).toBeDefined();
});

test('a completed figure receipt does not hide restored pack recovery', async () => {
  setShop({ hasPurchase: true, order: { ...order, status: 'confirmed' } });
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'waiting-result' } });
  await mountRecovery();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('pack')).toBeDefined();
  expect(button('Continue purchase')).toBeDefined();
});

test('closing figure processing never cancels, re-signs, or reopens on background status changes', async () => {
  external(); setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'submitted' } });
  setPack({ catalog: { ...INITIAL_PACK, available: true } });
  await mountRecovery();
  await Renderer.act(() => purchaseModal('figure').props.onRequestClose());
  expect(visibleModals()).toHaveLength(0);
  expect(button('Continue purchase')).toBeDefined();
  expect(button('Cancel purchase')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
  expect(button('Buy fighter pack').props.disabled).toBe(true);
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'confirmed' } }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('Continue purchase')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(false);
  expect(button('Buy fighter pack').props.disabled).toBe(false);
  expect(shop.dismiss).not.toHaveBeenCalled(); expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});

test('figure preparation failure can retry the saved request inside the popup without a second purchase', async () => {
  setShop({ hasPurchase: true, order: null, error: 'Could not connect. Try again.' });
  await mountRecovery();
  expect(purchaseModal('figure').findAllByType(ActivityIndicator)).toHaveLength(0);
  await press('Check purchase status');
  expect(shop.checkStatus).toHaveBeenCalledTimes(1);
  expect(shop.prepare).not.toHaveBeenCalled();
  await press('Close figure purchase popup');
  await press('Continue purchase');
  expect(shop.dismiss).not.toHaveBeenCalled();
});

test('reconnecting a figure signer replaces the purchase popup with one account popup and returns to the same review', async () => {
  setShop({ hasPurchase: true, signingStarted: true, order });
  await mountRecovery(); const host = purchaseModal('figure'); await press('Sign in with email');
  expect(visibleModals()).toHaveLength(1);
  expect(tree.root.findByType(Modal)).toBe(host);
  expect(button('Close figure purchase popup')).toBeUndefined();
  expect(button('Send sign-in code')).toBeDefined();
  await press('Close shop account');
  expect(purchaseModal('figure')).toBe(host);
  expect(button('Cancel purchase')).toBeUndefined();
  expect(shop.dismiss).not.toHaveBeenCalled();
});

test('explicitly dismissing a completed figure closes its popup after durable state clears', async () => {
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } });
  await mountRecovery(); setShop({ hasPurchase: true, order: { ...order, status: 'confirmed' } }); await updateScreen(); await press('Done');
  expect(shop.dismiss).toHaveBeenCalledTimes(1);
  setShop({ hasPurchase: false, order: null }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('Continue purchase')).toBeUndefined();
});

test('new pack buy keeps preparation visible without quote approval until signing completes', async () => {
  let finish!: () => void;
  pack.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  await mount(); await press('Buy fighter pack');
  expect(visibleModals()).toHaveLength(1);
  const host = purchaseModal('pack');
  setPack({ hasPurchase: true, busy: true, order: packOrder }); await updateScreen();
  expect(purchaseModal('pack')).toBe(host);
  expect(text('Preparing purchase')).toBe(true);
  expect(button('Continue in wallet')).toBeUndefined();
  await Renderer.act(async () => finish());
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'submitted' } }); await updateScreen();
  expect(purchaseModal('pack')).toBeDefined();
  expect(button('Continue purchase')).toBeDefined();
  expect(pack.confirm).not.toHaveBeenCalled();
});

test.each(['prepared', 'submitted', 'waiting-result', 'ready-to-claim'] as const)('unfinished pack %s opens on request with truthful actions', async status => {
  external(); setPack({ hasPurchase: true, signingStarted: status !== 'prepared', order: { ...packOrder, status, result: null } });
  await mountRecovery();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('pack')).toBeDefined();
  expect(Boolean(button('Continue in wallet'))).toBe(status === 'prepared');
  expect(button('Done')).toBeUndefined();
  expect(purchaseModal('pack').findAllByType(ActivityIndicator).length > 0).toBe(['submitted', 'waiting-result', 'ready-to-claim'].includes(status));
});

test('closing and reopening a paid pack preserves its result and cannot create another payment', async () => {
  external(); setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'waiting-result' } });
  await mountRecovery(); await press('Close pack purchase popup');
  expect(visibleModals()).toHaveLength(0);
  expect(button('Buy fighter pack')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
  setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'ready-to-claim', result: 'bonk' } }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await press('Continue purchase');
  await press('Check pack status');
  expect(pack.checkStatus).toHaveBeenCalledTimes(1);
  expect(button('Cancel pack purchase')).toBeUndefined();
  expect(pack.dismiss).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
});

test('a pack signer can reconnect without stacking account and purchase popups', async () => {
  setPack({ hasPurchase: true, signingStarted: true, order: packOrder });
  await mountRecovery(); const host = purchaseModal('pack'); await press('Sign in to purchase account');
  expect(visibleModals()).toHaveLength(1);
  expect(tree.root.findByType(Modal)).toBe(host);
  expect(button('Close pack purchase popup')).toBeUndefined();
  expect(button('Send sign-in code')).toBeDefined();
  await press('Close shop account');
  expect(purchaseModal('pack')).toBe(host);
  expect(button('Cancel pack purchase')).toBeUndefined();
  expect(pack.dismiss).not.toHaveBeenCalled();
});

test('pack preparation errors and status retries remain inside the popup', async () => {
  setPack({ hasPurchase: true, order: null, error: 'Request failed. Try again.' });
  await mountRecovery();
  expect(purchaseModal('pack').findAllByType(ActivityIndicator)).toHaveLength(0);
  await press('Check pack status');
  expect(pack.checkStatus).toHaveBeenCalledTimes(1); expect(pack.prepare).not.toHaveBeenCalled();
});

test('confirmed pack opens Army with the exact awarded asset and hides its popup', async () => {
  setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'waiting-result' } });
  await mountRecovery();
  setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'confirmed', result: 'bonk' } }); await updateScreen();
  expect(button('Done')).toBeDefined();
  await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: packOrder.asset });
  expect(visibleModals()).toHaveLength(0);
  expect(pack.dismiss).not.toHaveBeenCalled();
});

test('confirmed pack contains only its reward and actions, without technical records or unfinished recovery', async () => {
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'waiting-result' } });
  await mountRecovery(); setPack({ hasPurchase: true, order: { ...packOrder, status: 'confirmed', result: 'jup' } }); await updateScreen();
  expectSimplePurchase('pack');
  expect(text('Jup')).toBe(true);
  expect(button('View pack record')).toBeUndefined(); expect(button('Check pack status')).toBeUndefined();
  expect(text('Closing this popup keeps your pack purchase saved.')).toBe(false);
  expect(button('Add to your army')).toBeDefined();
  await press('Done'); expect(pack.dismiss).toHaveBeenCalledTimes(1);
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(pack.prepare).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});

test('if both durable purchase records restore, only one popup is presented at a time', async () => {
  setShop({ hasPurchase: true, order }); setPack({ hasPurchase: true, order: packOrder });
  await mountRecovery(); expect(visibleModals()).toHaveLength(1); expect(purchaseModal('figure')).toBeDefined();
  await press('Close figure purchase popup');
  setShop({ hasPurchase: true, order: { ...order, status: 'confirmed' } }); await updateScreen();
  await press('Continue purchase');
  expect(visibleModals()).toHaveLength(1); expect(purchaseModal('pack')).toBeDefined();
  expect(shop.prepare).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
});
test.each(['submitted', 'failed', 'expired'] as const)('purchase %s has an honest recovery state and cannot approve again', async status => {
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'submitted' } }); await mountRecovery();
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status } }); await updateScreen();
  expect(button('Continue in wallet')).toBeUndefined(); expect(button('Continue in wallet')).toBeUndefined();
  if (status === 'submitted') { expect(button('Done')).toBeUndefined(); await press('Check purchase status'); expect(shop.checkStatus).toHaveBeenCalledTimes(1); }
  else { expect(button('Done')).toBeDefined(); expect(text(status === 'failed' ? 'PURCHASE FAILED' : 'PURCHASE EXPIRED')).toBe(true); }
  expect(shop.confirm).not.toHaveBeenCalled();
});

test.each(['failed', 'expired'] as const)('%s figure popup has Retry and retains visible progress through a fresh wallet handoff', async status => {
  external(); setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'submitted' } }); await mountRecovery();
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status } }); await updateScreen();
  expect(button('Retry').props.disabled).toBe(false); expect(button('Done')).toBeDefined();
  if (status === 'expired') expect(text('This purchase expired. Tap Retry to try again.')).toBe(true);
  const modal = purchaseModal('figure'); const retry = button('Retry').props.onPress;
  let finish!: () => void; const pending = new Promise<void>(resolve => { finish = resolve; });
  const next = { ...order, id: 'b'.repeat(64) };
  jest.mocked(signShopTransaction).mockResolvedValueOnce('new-signed');
  shop.retry.mockImplementationOnce(async (_proof, sign) => { await pending; await sign(next); });
  await press('Retry');
  expect(purchaseModal('figure')).toBe(modal); expect(tree.root.findAllByType(View).filter(node => node.props.testID === 'purchase-handoff')).toHaveLength(1);
  await Renderer.act(async () => { retry(); });
  expect(shop.retry).toHaveBeenCalledTimes(1);
  expect(shop.retry).toHaveBeenCalledWith(proveSeekerWallet, expect.any(Function));
  expect(signShopTransaction).not.toHaveBeenCalled();
  await Renderer.act(async () => { finish(); await pending; });
  expect(signShopTransaction).toHaveBeenCalledWith(next);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.dismiss).not.toHaveBeenCalled();
});

test.each(['prepared', 'submitted', 'confirmed'] as const)('Retry is absent for %s figure purchases', async status => {
  external(); setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } }); await mountRecovery();
  setShop({ hasPurchase: true, order: { ...order, status } }); await updateScreen();
  expect(button('Retry')).toBeUndefined(); expect(shop.retry).not.toHaveBeenCalled();
});

test.each(['wrong-account', 'busy', 'restoring', 'pending-pack', 'unsupported-seeker'] as const)('Retry cannot bypass %s purchase guards', async blocked => {
  external(); setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } }); await mountRecovery();
  if (blocked === 'wrong-account') external('another-buyer');
  if (blocked === 'unsupported-seeker') {
    jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: false });
    jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer });
  }
  if (blocked === 'pending-pack') setPack({ hasPurchase: true, order: { ...packOrder, status: 'submitted' } });
  setShop({ hasPurchase: true, order: { ...order, status: 'expired' }, busy: blocked === 'busy', ready: blocked !== 'restoring' }); await updateScreen();
  expect(button('Retry').props.disabled).toBe(true);
  await press('Retry'); expect(shop.retry).not.toHaveBeenCalled(); expect(shop.prepare).not.toHaveBeenCalled();
});

test('Retry for a general fighter uses the email signer on iOS and never starts a Seeker proof', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, signShopTransaction: jest.fn().mockResolvedValue('signed') });
  const jup = { ...fig2, id: 'jup', seekerExclusive: false, name: 'Jup' };
  setShop({ catalog: { ...shop.catalog, figures: [jup] }, hasPurchase: true, order: { ...order, figureId: 'jup', status: 'submitted' } }); await mountRecovery();
  setShop({ catalog: { ...shop.catalog, figures: [jup] }, hasPurchase: true, order: { ...order, figureId: 'jup', status: 'expired' } }); await updateScreen();
  await press('Retry');
  expect(shop.retry).toHaveBeenCalledWith(undefined, expect.any(Function));
  expect(proveSeekerWallet).not.toHaveBeenCalled();
});

test('closing during Retry preparation pauses delayed wallet opening without losing the new saved purchase', async () => {
  external(); setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } }); await mountRecovery();
  setShop({ hasPurchase: true, order: { ...order, status: 'expired' } }); await updateScreen();
  let sign!: (order: MintOrder) => Promise<string>; let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  shop.retry.mockImplementationOnce(async (_proof, approve) => { sign = approve; await pending; });
  await press('Retry'); await press('Close figure purchase popup');
  await expect(sign({ ...order, id: 'b'.repeat(64) })).rejects.toThrow(/Purchase paused/);
  expect(signShopTransaction).not.toHaveBeenCalled(); expect(shop.dismiss).not.toHaveBeenCalled();
  await Renderer.act(async () => { finish(); await pending; });
});

test('a different connected wallet cannot sign an existing order', async () => {
  external('other1111111111111111111111111111'); setShop({ hasPurchase: true, order }); await mountRecovery();
  expect(button('Continue in wallet').props.disabled).toBe(true);
  expect(button('Payment details')).toBeUndefined(); expect(button('Reconnect wallet')).toBeDefined();
  expect(text(order.buyer)).toBe(false); expect(shop.confirm).not.toHaveBeenCalled();
});

test.each([false, true])('store and email registration use figure/account language without crypto explanations (Seeker: %s)', async seeker => {
  if (seeker) external(null);
  await mount();
  await press(seeker ? 'Connect your wallet' : 'Register');
  const copy = tree.root.findAllByType(Text).flatMap(node => [node.props.children].flat(Infinity)).filter(value => typeof value === 'string').join(' ');
  expect(copy).not.toMatch(/\bmint(?:s|ing)?\b|\bNFTs?\b|metaplex|\bcore\b|self[- ]custodial|embedded|genesis token|mainnet|blockchain|network fees/i);
  if (!seeker) {
    expect(copy).not.toMatch(/wallet|\bSOL\b/i);
    expect(text('0.01 SOL')).toBe(false);
  }
  expect(shop.prepare).not.toHaveBeenCalled();
});

test.each(['ios', 'android'] as const)('ordinary %s offers email registration before preparing a general figure purchase', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  const figure: ShopFigure = { ...fig2, id: 'bonk', variant: 3, name: 'BONK', seekerExclusive: false, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.bonk };
  // Unsupported phones must never use a stale external-wallet identity.
  jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), address: buyer });
  setShop({ catalog: { ...shop.catalog, figures: [figure] } });
  await mount();
  expect(button('Buy BONK').props.disabled).toBe(false);
  expect(text('6,900,000 BONK')).toBe(true);
  await press('Buy BONK');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(button('Send sign-in code')).toBeDefined();
  expect(button('Connect your wallet')).toBeUndefined();
  expect(shop.prepare).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
  expect(text('Coming soon')).toBe(false);
  expect(connect).not.toHaveBeenCalled();
});

test.each([
  ['ios', 'bonk'], ['ios', 'jup'], ['ios', 'ore'], ['android', 'bonk'], ['android', 'jup'], ['android', 'ore'],
] as const)('%s can buy %s with its email account and explicit approval', async (os, id) => {
  jest.replaceProperty(Platform, 'OS', os);
  const signer = jest.fn();
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, signShopTransaction: signer });
  const figure: ShopFigure = { ...fig2, ...FIGURES.find(f => f.id === id)!, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS[id] };
  setShop({ catalog: { ...shop.catalog, figures: [figure] } });
  await mount();
  expect(text(figurePaymentPrice(figure, 'mainnet-beta'))).toBe(true);
  await press(`Buy ${figure.name}`);
  expect(shop.prepare).toHaveBeenCalledWith(id, buyer, undefined, expect.any(Function));
  expect(shop.confirm).not.toHaveBeenCalled();
  expect(proveSeekerWallet).not.toHaveBeenCalled();
  const savedOrder = { ...order, figureId: id, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS[id] };
  setShop({ catalog: { ...shop.catalog, figures: [figure] }, hasPurchase: true, order: savedOrder });
  await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params: undefined } as never} />));
  expect(text(`${figurePaymentPrice(figure, 'mainnet-beta')} + 0.001005 SOL`)).toBe(false);
  await press('Continue in wallet');
  expect(shop.confirm).toHaveBeenCalledWith(expect.any(Function));
  await Renderer.act(() => shop.confirm.mock.calls[0]![0](savedOrder));
  expect(signer).toHaveBeenCalledWith(savedOrder);
  expect(signShopTransaction).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});

test('a saved email account cannot replace direct Seeker connection for a general figure', async () => {
  external(null);
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, busy: true });
  setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, id: 'jup', variant: 4, name: 'Jup', seekerExclusive: false, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.jup }] } });
  await mount({ signIn: true });
  await press('Close shop account');
  await press('Buy Jup');
  expect(connect).toHaveBeenCalledTimes(1);
  expect(shop.prepare).not.toHaveBeenCalled();
  expect(proveSeekerWallet).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
});

test.each(['unauthenticated', 'authenticated', 'authenticated-unverified', 'unavailable'] as const)('connected Seeker account settings never show email UI (%s)', async status => {
  external();
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), status, address: status === 'authenticated' ? buyer : null, error: 'Sign in with email is unavailable.', codeSent: true });
  await mount({ signIn: true });
  await press('Close shop account');
  await press('Choose purchase wallet');
  expect(visibleModals()).toHaveLength(1);
  const copy = tree.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
  expect(copy).not.toMatch(/email|registration|sign-in code/i);
  expect(button('Send sign-in code')).toBeUndefined();
  expect(button('Use email account')).toBeUndefined();
  expect(button('Finish registration')).toBeUndefined();
  expect(button('Disconnect wallet')).toBeDefined();
  expect(tree.root.findAllByType(TextInput).some(node => /Email|verification code/.test(node.props.accessibilityLabel ?? ''))).toBe(false);
  expect(usePrivyWallet).toHaveBeenCalledWith(false);
});

test.each(['figure', 'pack'] as const)('Seeker saved %s approval uses only the external signer even when an old email account matches', async kind => {
  external();
  const emailSigner = jest.fn();
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer, signShopTransaction: emailSigner });
  if (kind === 'figure') setShop({ hasPurchase: true, order });
  else setPack({ hasPurchase: true, order: packOrder });
  (kind === 'figure' ? shop.confirm : pack.confirm).mockImplementationOnce(async sign => { await sign(kind === 'figure' ? order : packOrder); });
  await mountRecovery(); await press('Continue in wallet');
  expect(kind === 'figure' ? shop.confirm : pack.confirm).toHaveBeenCalledWith(expect.any(Function));
  expect(signShopTransaction).toHaveBeenCalledWith(kind === 'figure' ? order : packOrder);
  expect(emailSigner).not.toHaveBeenCalled();
});

test.each(['unavailable', 'missing-price', 'restoring', 'busy', 'pending-figure', 'pending-pack'] as const)('email figure purchases stay blocked when %s', async condition => {
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer });
  const figure: ShopFigure = { ...fig2, id: 'jup', variant: 4, name: 'Jup', seekerExclusive: false, priceLamports: condition === 'missing-price' ? null : '0', available: condition !== 'unavailable', tokenPayment: FIGURE_TOKEN_PAYMENTS.jup };
  setShop({ catalog: { ...shop.catalog, figures: [figure] }, ready: condition !== 'restoring', busy: condition === 'busy', hasPurchase: condition === 'pending-figure' });
  if (condition === 'pending-pack') jest.mocked(usePackShop).mockReturnValue({ ...pack, hasPurchase: true } as unknown as ReturnType<typeof usePackShop>);
  await mount();
  expect(button('Buy Jup').props.disabled).toBe(true);
  // Call the handler too: the guards must hold independently of disabled UI.
  await press('Buy Jup');
  expect(shop.prepare).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
});

test('technical purchase errors become actionable purchase messages, not raw payment terminology', async () => {
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } }); await mountRecovery();
  setShop({ hasPurchase: true, order: { ...order, status: 'failed', error: 'Metaplex Core mint transaction simulation failed' }, error: 'Minting is not available yet.' });
  await updateScreen();
  expect(text('Purchases are not available yet.')).toBe(true);
  expect(text('The purchase failed. Check its status before trying again.')).toBe(true);
  expect(text('Metaplex Core mint transaction simulation failed')).toBe(false);
  expect(text('Purchase not completed')).toBe(true);
  expect(button('Continue in wallet')).toBeUndefined();
});

test('test-mode purchase amounts cannot be mistaken for a real charge', async () => {
  external();
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted', cluster: 'devnet' }, catalog: { ...shop.catalog, cluster: 'devnet' } });
  await mountRecovery();
  expect(text('TEST MODE · NO REAL PURCHASES')).toBe(true);
  expect(text('Test purchase only. No real payment.')).toBe(true);
  expectSimplePurchase('figure');
  expect(text('0.011005 test credits')).toBe(false);
  expect(text('0.011005 SOL')).toBe(false);
});
test('unavailable catalog figure never invents a price or enables purchase', async () => {
  external();
  setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, available: false, priceLamports: null }] } });
  await mount(); expect(text('Not available')).toBe(true);
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
});
test('empty, loading, failed catalog and devnet have honest distinct states', async () => {
  setShop({ catalog: null }); await mount();
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Loading figures' }).length).toBeGreaterThan(0);
  setShop({ catalog: { ...shop.catalog, cluster: 'devnet', figures: [] } });
  await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{} as never} />));
  expect(text('New fighters on the way')).toBe(true); expect(text('TEST MODE · NO REAL PURCHASES')).toBe(true);
  setShop({ catalog: null, error: 'Could not load catalog' });
  await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{} as never} />));
  expect(text('Could not load catalog')).toBe(true); await press('Try again'); expect(shop.loadCatalog).toHaveBeenCalledTimes(1);
});
test('email validation is local, input is preserved, and OTP remains in-app', async () => {
  await mount(); await press('Register');
  const input = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Email address')!;
  await Renderer.act(() => input().props.onChangeText('bad-email')); await press('Send sign-in code');
  expect(text('Enter a valid email address.')).toBe(true); expect(sendCode).not.toHaveBeenCalled();
  expect(input().props.value).toBe('bad-email');
  await Renderer.act(() => input().props.onChangeText(' test@example.com ')); await press('Send sign-in code');
  expect(sendCode).toHaveBeenCalledWith('test@example.com');
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), codeSent: true });
  await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{} as never} />));
  const otp = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Email verification code')!;
  expect(otp.props.autoComplete).toBe('one-time-code');
  await Renderer.act(() => otp.props.onChangeText('123456')); await press('Sign in');
  expect(verifyCode).toHaveBeenCalledWith('test@example.com', '123456');
});
test('disconnect clears wallet binding and cached paid slots, not the NFT', async () => {
  external(); await mount(); await press('Choose purchase wallet'); await press('Disconnect wallet');
  expect(shop.clearWallet).toHaveBeenCalledTimes(1); expect(disconnect).toHaveBeenCalledTimes(1);
  expect(saveFigureSlots).toHaveBeenCalledWith(Array(14).fill(null));
});
