import React from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Renderer from 'react-test-renderer';
import { useShop } from '@rps/game-client/use-shop';
import { usePackShop } from '@rps/game-client/use-pack-shop';
import { INITIAL_PACK, PACK_PAYMENT } from '@rps/core/packs';
import { FIGURES, FIGURE_TOKEN_PAYMENTS, figurePaymentPrice, type MintOrder, type ShopFigure } from '@rps/core/shop';
import { ShopScreen } from '../src/screens/shop-screen';
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
const shop = { catalog: { cluster: 'mainnet-beta', collection: order.collection, treasury: order.treasury, figures: [fig2] }, order: null, hasPurchase: false, signingStarted: false, ready: true, busy: false, error: null, prepare: jest.fn(), confirm: jest.fn(), dismiss: jest.fn(), checkStatus: jest.fn(), loadCatalog: jest.fn(), clearWallet: jest.fn() };
const pack = { ...shop, catalog: INITIAL_PACK, prepare: jest.fn(), confirm: jest.fn(), dismiss: jest.fn(), checkStatus: jest.fn(), loadCatalog: jest.fn() };
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
  for (const action of [shop.prepare, shop.confirm, shop.dismiss, shop.checkStatus, shop.loadCatalog, shop.clearWallet, disconnect, connect, sendCode, verifyCode]) action.mockResolvedValue(undefined);
  jest.mocked(useShop).mockReturnValue(shop as unknown as ReturnType<typeof useShop>);
  jest.mocked(usePackShop).mockReturnValue(pack as unknown as ReturnType<typeof usePackShop>);
  jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: true, playerId: 'player', sessionToken: 'token', error: null });
  jest.mocked(useSolanaWallet).mockReturnValue({ address: null, label: null, status: 'disconnected', error: null, isSupported: false, connect, disconnect });
  jest.mocked(usePrivyWallet).mockReturnValue({ configured: true, address: null, error: null, activity: 'idle', status: 'unauthenticated', busy: false, codeSent: false, sendCode, verifyCode, disconnect, signShopTransaction: jest.fn() } as unknown as ReturnType<typeof usePrivyWallet>);
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); if (appStateDescriptor) Object.defineProperty(AppState, 'currentState', appStateDescriptor); });
async function mount(params?: { signIn: boolean }) { await Renderer.act(async () => { tree = Renderer.create(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params } as never} />); }); }
function button(label: string) { return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]; }
async function press(label: string) { await Renderer.act(async () => { await button(label).props.onPress(); }); }
function text(value: string) { return tree.root.findAllByType(Text).some(node => node.props.children === value); }
function setShop(next: object) { jest.mocked(useShop).mockReturnValue({ ...shop, purchaseBuyer: null, fundingRequired: null, buyWithSol: jest.fn(), ...next } as ReturnType<typeof useShop>); }
function external(address: string | null = buyer) { jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: true, address, status: address ? 'connected' : 'disconnected' }); }
function visibleModals() { return tree.root.findAllByType(Modal).filter(node => node.props.visible); }
function purchaseModal(id: 'figure' | 'pack') {
  const modal = visibleModals().find(node => node.findAllByProps({ testID: `${id}-purchase-dialog` }).length > 0);
  expect(modal).toBeDefined();
  return modal!;
}
async function updateScreen() { await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params: undefined } as never} />)); }
function setPack(next: object) { jest.mocked(usePackShop).mockReturnValue({ ...pack, ...next } as unknown as ReturnType<typeof usePackShop>); }

test('figure Buy with SOL goes directly to wallet signing without another quote confirmation', async () => {
  const buyWithSol = jest.fn(async sign => { await sign(order); });
  jest.mocked(signShopTransaction).mockResolvedValueOnce('AQ==');
  external();
  setShop({ hasPurchase: true, purchaseBuyer: buyer, error: 'Not enough ORE', fundingRequired: { symbol: 'ORE' }, buyWithSol });
  await mount(); purchaseModal('figure');
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
  await mount(); purchaseModal('pack'); await press('Buy with SOL');
  expect(buyWithSol).toHaveBeenCalledWith(expect.any(Function));
  expect(signShopTransaction).toHaveBeenCalledWith(packOrder);
  expect(pack.prepare).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});
const packOrder = { ...order, payment: PACK_PAYMENT, drops: INITIAL_PACK.drops, receipt: order.asset, edition: order.asset, version: 1, result: null, randomness: null };

test.each(['ios', 'android'] as const)('ORE pack shows all three chances and its confirmed reward on %s', async os => {
  jest.replaceProperty(Platform, 'OS', os);
  const drops = [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }];
  setPack({ catalog: { ...INITIAL_PACK, available: true, version: 2, drops } });
  await mount();
  for (const label of ['Jup', 'BONK', 'ORE', '40% chance', '20% chance']) expect(text(label)).toBe(true);
  setPack({ catalog: { ...INITIAL_PACK, available: true, version: 2, drops }, hasPurchase: true,
    order: { ...packOrder, version: 2, drops, status: 'confirmed', result: 'ore' } });
  await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await press('View pack purchase');
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
  expect(visibleModals()).toHaveLength(1);
  await press('Continue in wallet');expect(pack.confirm).toHaveBeenCalledWith(signer);
});

test.each(['bonk', 'jup', 'ore'] as const)('%s submitted receipt shows token price plus separate SOL fees, without Seeker proof', async id => {
  external();
  const figure: ShopFigure = { ...fig2, ...FIGURES.find(f => f.id === id)!, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS[id] };
  setShop({ catalog: { ...shop.catalog, figures: [figure] } });
  await mount();
  expect(text(figurePaymentPrice(figure, 'mainnet-beta'))).toBe(true);
  await press(`Buy ${figure.name}`);
  expect(shop.prepare).toHaveBeenCalledWith(id, buyer, undefined, expect.any(Function));
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted', figureId: id, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS[id] } });
  await Renderer.act(() => tree.update(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params: undefined } as never} />));
  expect(text(`${figurePaymentPrice(figure, 'mainnet-beta')} + 0.001005 SOL`)).toBe(true);
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
  await mount();
  expect(shop.confirm).not.toHaveBeenCalled();
  await press('Continue in wallet');
  expect(shop.confirm).toHaveBeenCalledWith(sign);
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
test.each(['figure', 'pack'] as const)('new %s buy invokes wallet signing with no intermediate quote popup', async kind => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  jest.mocked(signShopTransaction).mockImplementationOnce(async () => { expect(visibleModals()).toHaveLength(0); await wait; return 'AQ=='; });
  if (kind === 'figure') shop.prepare.mockImplementationOnce(async (_id, _buyer, _proof, sign) => { await sign(order); });
  else pack.prepare.mockImplementationOnce(async (_buyer, sign) => { await sign(packOrder); });
  await mount(); await press(kind === 'figure' ? 'Buy Seeker fighter' : 'Buy fighter pack');
  expect(signShopTransaction).toHaveBeenCalledWith(kind === 'figure' ? order : packOrder);
  expect(visibleModals()).toHaveLength(0);
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
test('Seeker SKR catalog and submitted receipt keep SOL fees separate; old SOL receipts retain their units', async () => {
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
  expect(modal.findAllByType(Text).some(node => node.props.children === '1 SKR')).toBe(true);
  expect(modal.findAllByType(Text).some(node => node.props.children === '1 SKR + 0.001005 SOL')).toBe(true);
  setShop({ catalog, hasPurchase: true, order: { ...order, status: 'submitted' } }); await updateScreen();
  modal = purchaseModal('figure');
  expect(modal.findAllByType(Text).some(node => node.props.children === '0.01 SOL')).toBe(true);
  expect(modal.findAllByType(Text).some(node => node.props.children === '0.011005 SOL')).toBe(true);
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
  await mount(); const host = purchaseModal('pack'); await press('Sign in to purchase account');
  expect(connect).toHaveBeenCalledTimes(1); expect(purchaseModal('pack')).toBe(host);
  expect(button('Send sign-in code')).toBeUndefined(); expect(pack.prepare).not.toHaveBeenCalled();
  external(); await updateScreen(); await press('Continue in wallet');
  expect(pack.confirm).toHaveBeenCalledWith(signShopTransaction); expect(pack.dismiss).not.toHaveBeenCalled();
});
test('restored prepared purchase offers wallet continuation without a second quote confirmation', async () => {
  external(); setShop({ hasPurchase: true, order }); await mount();
  expect(text('0.001005 SOL')).toBe(false); expect(text('0.011005 SOL')).toBe(false);
  expect(text(order.buyer)).toBe(false); expect(text(order.treasury)).toBe(false);
  await press('Payment details');
  expect(text(order.buyer)).toBe(true); expect(text(order.treasury)).toBe(true);
  // Native View cannot render literal JSX strings (including escaped newlines).
  expect(tree.root.findAllByType(View).flatMap(node => node.children.filter(child => typeof child === 'string'))).toEqual([]);
  expect(shop.confirm).not.toHaveBeenCalled();
  await press('Continue in wallet'); expect(shop.confirm).toHaveBeenCalledWith(signShopTransaction);
});
test('restored signing intent cannot be canceled or replaced; reconnect remains available', async () => {
  external(null); setShop({ hasPurchase: true, signingStarted: true, order }); await mount();
  expect(button('Cancel purchase')).toBeUndefined(); expect(button('Check purchase status')).toBeDefined();
  expect(button('Continue in wallet').props.disabled).toBe(true);
  await press('Reconnect wallet'); expect(connect).toHaveBeenCalledTimes(1);
  expect(button('Send sign-in code')).toBeUndefined(); expect(purchaseModal('figure')).toBeDefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
});
test('confirmed mint opens Army with the exact new Core asset id', async () => {
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'confirmed', signature: 'sig' } });
  await mount();
  expect(visibleModals()).toHaveLength(0);
  await press('View figure purchase');
  expect(button('Done')).toBeDefined(); expect(button('Continue in wallet')).toBeUndefined();
  await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: order.asset });
  expect(visibleModals()).toHaveLength(0);
});

test('new figure buy hides our popup through preparation/signing and deduplicates taps', async () => {
  external(); let finish!: () => void;
  shop.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount(); const trigger = button('Buy Seeker fighter');
  await Renderer.act(async () => { trigger.props.onPress(); trigger.props.onPress(); });
  expect(shop.prepare).toHaveBeenCalledTimes(1);
  setShop({ hasPurchase: true, busy: true, order }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Opening purchase in wallet' }).length).toBeGreaterThan(0);
  await Renderer.act(async () => finish());
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted' } }); await updateScreen();
  expect(purchaseModal('figure')).toBeDefined();
  expect(shop.confirm).not.toHaveBeenCalled();
});

test.each(['prepared', 'submitted'] as const)('restored unfinished figure %s appears in one popup', async status => {
  setShop({ hasPurchase: true, signingStarted: status !== 'prepared', order: { ...order, status } });
  await mount();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('figure').findAllByType(Text).some(node => node.props.children === (status === 'submitted' ? 'Processing purchase' : 'Continue your purchase'))).toBe(true);
  expect(purchaseModal('figure').findAllByProps({ accessibilityLabel: `Purchase status ${status}` }).length).toBeGreaterThan(0);
});

test.each(['confirmed', 'failed', 'expired'] as const)('restored terminal figure %s stays closed, including after re-entering Shop', async status => {
  external();
  const saved = { hasPurchase: true, signingStarted: true, order: { ...order, status } };
  await mount();
  // Durable storage resolves asynchronously after the shop has mounted.
  setShop(saved); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('View figure purchase')).toBeDefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
  await press('View figure purchase');
  expect(purchaseModal('figure')).toBeDefined();
  expect(button('Done')).toBeDefined();
  await press('Close figure purchase popup');
  setShop({ ...saved, order: { ...saved.order } }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await Renderer.act(() => tree.unmount());
  await mount();
  expect(visibleModals()).toHaveLength(0);
  expect(shop.dismiss).not.toHaveBeenCalled();
  expect(shop.prepare).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
});

test.each(['confirmed', 'failed', 'expired'] as const)('restored terminal pack %s stays closed and its receipt remains available', async status => {
  await mount();
  const saved = { hasPurchase: true, signingStarted: true, order: { ...packOrder, status, result: status === 'confirmed' ? 'bonk' : null } };
  setPack(saved); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('View pack purchase')).toBeDefined();
  await press('View pack purchase');
  expect(purchaseModal('pack')).toBeDefined();
  expect(button('Done')).toBeDefined();
  await press('Close pack purchase popup');
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
  expect(text('Purchase complete. Your figure is in your collection.')).toBe(true);
});

test('an active pack keeps its reward popup open when it completes', async () => {
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  await mount(); await press('Buy fighter pack');
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'waiting-result' } }); await updateScreen();
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'confirmed', result: 'bonk' } }); await updateScreen();
  expect(purchaseModal('pack')).toBeDefined();
  expect(text('Purchase complete. Your fighter is ready for your army.')).toBe(true);
});

test('a completed figure receipt does not hide restored pack recovery', async () => {
  setShop({ hasPurchase: true, order: { ...order, status: 'confirmed' } });
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'waiting-result' } });
  await mount();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('pack')).toBeDefined();
  expect(button('View figure purchase')).toBeDefined();
});

test('closing figure processing never cancels, re-signs, or reopens on background status changes', async () => {
  external(); setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'submitted' } });
  await mount();
  await Renderer.act(() => purchaseModal('figure').props.onRequestClose());
  expect(visibleModals()).toHaveLength(0);
  expect(button('View figure purchase')).toBeDefined();
  expect(button('Cancel purchase')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
  expect(button('Buy fighter pack').props.disabled).toBe(true);
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'confirmed' } }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await press('View figure purchase');
  expect(purchaseModal('figure')).toBeDefined();
  expect(text('Purchase complete. Your figure is in your collection.')).toBe(true);
  expect(shop.dismiss).not.toHaveBeenCalled(); expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});

test('figure preparation failure can retry the saved request inside the popup without a second purchase', async () => {
  setShop({ hasPurchase: true, order: null, error: 'Could not connect. Try again.' });
  await mount();
  expect(purchaseModal('figure').findAllByType(ActivityIndicator)).toHaveLength(0);
  await press('Check purchase status');
  expect(shop.checkStatus).toHaveBeenCalledTimes(1);
  expect(shop.prepare).not.toHaveBeenCalled();
  await press('Close figure purchase popup');
  await press('View figure purchase');
  expect(shop.dismiss).not.toHaveBeenCalled();
});

test('reconnecting a figure signer replaces the purchase popup with one account popup and returns to the same review', async () => {
  setShop({ hasPurchase: true, signingStarted: true, order });
  await mount(); const host = purchaseModal('figure'); await press('Sign in with email');
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
  setShop({ hasPurchase: true, order: { ...order, status: 'confirmed' } });
  await mount(); await press('View figure purchase'); await press('Done');
  expect(shop.dismiss).toHaveBeenCalledTimes(1);
  setShop({ hasPurchase: false, order: null }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  expect(button('View figure purchase')).toBeUndefined();
});

test('new pack buy hides the quote popup until signing completes', async () => {
  let finish!: () => void;
  pack.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  external(); setPack({ catalog: { ...INITIAL_PACK, available: true } });
  await mount(); await press('Buy fighter pack');
  expect(visibleModals()).toHaveLength(0);
  setPack({ hasPurchase: true, busy: true, order: packOrder }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await Renderer.act(async () => finish());
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'submitted' } }); await updateScreen();
  expect(purchaseModal('pack')).toBeDefined();
  expect(button('View pack purchase')).toBeDefined();
  expect(pack.confirm).not.toHaveBeenCalled();
});

test.each(['prepared', 'submitted', 'waiting-result', 'ready-to-claim'] as const)('unfinished pack %s is shown in one popup with truthful actions', async status => {
  external(); setPack({ hasPurchase: true, signingStarted: status !== 'prepared', order: { ...packOrder, status, result: null } });
  await mount();
  expect(visibleModals()).toHaveLength(1);
  expect(purchaseModal('pack')).toBeDefined();
  expect(Boolean(button('Continue in wallet'))).toBe(status === 'prepared');
  expect(button('Done')).toBeUndefined();
  expect(purchaseModal('pack').findAllByType(ActivityIndicator).length > 0).toBe(['submitted', 'waiting-result', 'ready-to-claim'].includes(status));
});

test('closing and reopening a paid pack preserves its result and cannot create another payment', async () => {
  external(); setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'waiting-result' } });
  await mount(); await press('Close pack purchase popup');
  expect(visibleModals()).toHaveLength(0);
  expect(button('Buy fighter pack')).toBeUndefined();
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
  setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'ready-to-claim', result: 'bonk' } }); await updateScreen();
  expect(visibleModals()).toHaveLength(0);
  await press('View pack purchase');
  await press('Check pack status');
  expect(pack.checkStatus).toHaveBeenCalledTimes(1);
  expect(button('Cancel pack purchase')).toBeUndefined();
  expect(pack.dismiss).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled(); expect(pack.prepare).not.toHaveBeenCalled();
});

test('a pack signer can reconnect without stacking account and purchase popups', async () => {
  setPack({ hasPurchase: true, signingStarted: true, order: packOrder });
  await mount(); const host = purchaseModal('pack'); await press('Sign in to purchase account');
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
  await mount();
  expect(purchaseModal('pack').findAllByType(ActivityIndicator)).toHaveLength(0);
  await press('Check pack status');
  expect(pack.checkStatus).toHaveBeenCalledTimes(1); expect(pack.prepare).not.toHaveBeenCalled();
});

test('confirmed pack opens Army with the exact awarded asset and hides its popup', async () => {
  setPack({ hasPurchase: true, signingStarted: true, order: { ...packOrder, status: 'confirmed', result: 'bonk' } });
  await mount();
  expect(visibleModals()).toHaveLength(0);
  await press('View pack purchase');
  expect(button('Done')).toBeDefined();
  await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: packOrder.asset });
  expect(visibleModals()).toHaveLength(0);
  expect(pack.dismiss).not.toHaveBeenCalled();
});

test('pack record browser failures are visible in the popup and can retry', async () => {
  setPack({ hasPurchase: true, order: { ...packOrder, status: 'confirmed', result: 'jup' } });
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No handler'));
  await mount(); await press('View pack purchase'); await press('View pack record');
  expect(purchaseModal('pack').findAllByType(Text).some(node => node.props.children === 'Could not open the pack record. Please try again.')).toBe(true);
  await press('View pack record');
  expect(text('Could not open the pack record. Please try again.')).toBe(false);
  expect(pack.prepare).not.toHaveBeenCalled(); expect(pack.confirm).not.toHaveBeenCalled();
});

test('if both durable purchase records restore, only one popup is presented at a time', async () => {
  setShop({ hasPurchase: true, order }); setPack({ hasPurchase: true, order: packOrder });
  await mount(); expect(visibleModals()).toHaveLength(1); expect(purchaseModal('figure')).toBeDefined();
  await press('Close figure purchase popup'); await press('View pack purchase');
  expect(visibleModals()).toHaveLength(1); expect(purchaseModal('pack')).toBeDefined();
});
test.each(['submitted', 'failed', 'expired'] as const)('purchase %s has an honest recovery state and cannot approve again', async status => {
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status } }); await mount();
  if (status !== 'submitted') await press('View figure purchase');
  expect(button('Continue in wallet')).toBeUndefined(); expect(button('Continue in wallet')).toBeUndefined();
  if (status === 'submitted') { expect(button('Done')).toBeUndefined(); await press('Check purchase status'); expect(shop.checkStatus).toHaveBeenCalledTimes(1); }
  else { expect(button('Done')).toBeDefined(); expect(text(status === 'failed' ? 'PURCHASE FAILED' : 'PURCHASE EXPIRED')).toBe(true); }
  expect(shop.confirm).not.toHaveBeenCalled();
});
test('a different connected wallet cannot sign an existing order', async () => {
  external('other1111111111111111111111111111'); setShop({ hasPurchase: true, order }); await mount();
  expect(button('Continue in wallet').props.disabled).toBe(true);
  await press('Payment details');
  expect(text(order.buyer)).toBe(true); expect(shop.confirm).not.toHaveBeenCalled();
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
  expect(shop.confirm).toHaveBeenCalledWith(signer);
  expect(signShopTransaction).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});

test('a Seeker email account can buy a general figure without switching to the external wallet', async () => {
  external(null);
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer });
  setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, id: 'jup', variant: 4, name: 'Jup', seekerExclusive: false, priceLamports: '0', tokenPayment: FIGURE_TOKEN_PAYMENTS.jup }] } });
  await mount({ signIn: true });
  await press('Close shop account');
  await press('Buy Jup');
  expect(shop.prepare).toHaveBeenCalledWith('jup', buyer, undefined, expect.any(Function));
  expect(proveSeekerWallet).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
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
  setShop({ hasPurchase: true, order: { ...order, status: 'failed', error: 'Metaplex Core mint transaction simulation failed' }, error: 'Minting is not available yet.' });
  await mount(); await press('View figure purchase');
  expect(text('Purchases are not available yet.')).toBe(true);
  expect(text('The purchase failed. Check its status before trying again.')).toBe(true);
  expect(text('Metaplex Core mint transaction simulation failed')).toBe(false);
  expect(text('Purchase not completed')).toBe(true);
  expect(button('Continue in wallet')).toBeUndefined();
});

test('test-mode purchase amounts cannot be mistaken for a real charge', async () => {
  external();
  setShop({ hasPurchase: true, order: { ...order, status: 'submitted', cluster: 'devnet' }, catalog: { ...shop.catalog, cluster: 'devnet' } });
  await mount();
  expect(text('TEST MODE · NO REAL PURCHASES')).toBe(true);
  expect(text('Test purchase only. No real payment.')).toBe(true);
  expect(text('0.011005 test credits')).toBe(true);
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
