import React from 'react';
import { Linking, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Renderer from 'react-test-renderer';
import { useShop } from '@rps/game-client/use-shop';
import type { MintOrder, ShopFigure } from '@rps/core/shop';
import { ShopScreen } from '../src/screens/shop-screen';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { useSolanaWallet } from '../src/hooks/use-solana-wallet';
import { usePrivyWallet } from '../src/hooks/use-privy-wallet';
import { proveSeekerWallet, signShopTransaction } from '../src/solana-wallet-adapter';
import { saveFigureSlots } from '../src/storage/figure-loadout';

jest.mock('@rps/game-client/use-shop');
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-solana-wallet');
jest.mock('../src/hooks/use-privy-wallet');
jest.mock('../src/solana-wallet-adapter', () => ({ proveSeekerWallet: jest.fn(), signShopTransaction: jest.fn() }));
jest.mock('../src/storage/figure-loadout', () => ({ saveFigureSlots: jest.fn(() => Promise.resolve()) }));

const buyer = 'buyer11111111111111111111111111111';
const fig2: ShopFigure = { id: 'fig2', variant: 2, name: 'Seeker fighter', description: 'A new face for your collection.', imageUrl: 'https://example.test/fig2.png', priceLamports: '10000000', available: true, seekerExclusive: true };
const order: MintOrder = { id: 'a'.repeat(64), figureId: 'fig2', buyer, asset: 'asset11111111111111111111111111111', treasury: 'treasury11111111111111111111111111', collection: 'collection11111111111111111111111', cluster: 'mainnet-beta', priceLamports: '10000000', networkFeeLamports: '1005000', transaction: 'AQ==', lastValidBlockHeight: 100, createdAt: 1, status: 'prepared', signature: null, error: null };
const shop = { catalog: { cluster: 'mainnet-beta', collection: order.collection, treasury: order.treasury, figures: [fig2] }, order: null, hasPurchase: false, signingStarted: false, ready: true, busy: false, error: null, prepare: jest.fn(), confirm: jest.fn(), dismiss: jest.fn(), checkStatus: jest.fn(), loadCatalog: jest.fn(), clearWallet: jest.fn() };
const disconnect = jest.fn();
const connect = jest.fn();
const sendCode = jest.fn();
const verifyCode = jest.fn();
const navigate = jest.fn();
const goBack = jest.fn();
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  for (const action of [shop.prepare, shop.confirm, shop.dismiss, shop.checkStatus, shop.loadCatalog, shop.clearWallet, disconnect, connect, sendCode, verifyCode]) action.mockResolvedValue(undefined);
  jest.mocked(useShop).mockReturnValue(shop as unknown as ReturnType<typeof useShop>);
  jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: true, playerId: 'player', sessionToken: 'token', error: null });
  jest.mocked(useSolanaWallet).mockReturnValue({ address: null, label: null, status: 'disconnected', error: null, isSupported: false, connect, disconnect });
  jest.mocked(usePrivyWallet).mockReturnValue({ configured: true, address: null, error: null, activity: 'idle', status: 'unauthenticated', busy: false, codeSent: false, sendCode, verifyCode, disconnect, signShopTransaction: jest.fn() } as unknown as ReturnType<typeof usePrivyWallet>);
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); });
async function mount(params?: { signIn: boolean }) { await Renderer.act(async () => { tree = Renderer.create(<ShopScreen navigation={{ navigate, goBack } as never} route={{ params } as never} />); }); }
function button(label: string) { return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]; }
async function press(label: string) { await Renderer.act(async () => { await button(label).props.onPress(); }); }
function text(value: string) { return tree.root.findAllByType(Text).some(node => node.props.children === value); }
function setShop(next: object) { jest.mocked(useShop).mockReturnValue({ ...shop, ...next } as ReturnType<typeof useShop>); }
function external(address: string | null = buyer) { jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: true, address, status: address ? 'connected' : 'disconnected' }); }

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

test('Seeker keeps wallet connection and optional email sign-in', async () => {
  external(null); await mount();
  expect(text('Connect your wallet')).toBe(true);
  await press('Choose purchase wallet');
  expect(button('Connect your wallet')).toBeDefined();
  expect(button('Send sign-in code')).toBeDefined();
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
  await press('Confirm purchase');
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
test('Solana Mobile Exclusive on iOS opens the store browser, never a wallet modal or mint', async () => {
  await mount(); await press('Solana Mobile Exclusive');
  expect(text('Solana Mobile Exclusive')).toBe(true);
  expect(Linking.openURL).toHaveBeenCalledWith('https://store.solanamobile.com/');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(shop.prepare).not.toHaveBeenCalled(); expect(shop.confirm).not.toHaveBeenCalled();
});
test('Seeker wallet prepares with the existing proof function but does not sign automatically', async () => {
  external(); await mount(); await press('Buy Seeker fighter');
  expect(shop.prepare).toHaveBeenCalledWith('fig2', buyer, proveSeekerWallet);
  expect(shop.confirm).not.toHaveBeenCalled();
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
  external(null); await mount(); await press('Choose purchase wallet'); await press('Connect your wallet');
  expect(connect).toHaveBeenCalledTimes(1); expect(shop.prepare).not.toHaveBeenCalled();
});
test('review shows price, fees, exact total and addresses before explicit approval', async () => {
  external(); setShop({ hasPurchase: true, order }); await mount();
  expect(text('0.001005 SOL')).toBe(true); expect(text('0.011005 SOL')).toBe(true);
  expect(text(order.buyer)).toBe(false); expect(text(order.treasury)).toBe(false);
  await press('Payment details');
  expect(text(order.buyer)).toBe(true); expect(text(order.treasury)).toBe(true);
  // Native View cannot render literal JSX strings (including escaped newlines).
  expect(tree.root.findAllByType(View).flatMap(node => node.children.filter(child => typeof child === 'string'))).toEqual([]);
  expect(shop.confirm).not.toHaveBeenCalled();
  await press('Confirm purchase'); expect(shop.confirm).toHaveBeenCalledWith(signShopTransaction);
});
test('restored signing intent cannot be canceled or replaced; reconnect remains available', async () => {
  external(null); setShop({ hasPurchase: true, signingStarted: true, order }); await mount();
  expect(button('Cancel purchase')).toBeUndefined(); expect(button('Check purchase status')).toBeDefined();
  expect(button('Retry purchase approval').props.disabled).toBe(true);
  await press('Reconnect wallet'); expect(button('Connect your wallet').props.disabled).toBe(false);
  await press('Connect your wallet'); expect(connect).toHaveBeenCalledTimes(1);
  expect(button('Buy Seeker fighter').props.disabled).toBe(true);
});
test('confirmed mint opens Army with the exact new Core asset id', async () => {
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status: 'confirmed', signature: 'sig' } });
  await mount(); await press('Add to your army');
  expect(navigate).toHaveBeenCalledWith('Army', { expectedAssetId: order.asset });
  expect(button('Done')).toBeDefined(); expect(button('Confirm purchase')).toBeUndefined();
});
test.each(['submitted', 'failed', 'expired'] as const)('purchase %s has an honest recovery state and cannot approve again', async status => {
  setShop({ hasPurchase: true, signingStarted: true, order: { ...order, status } }); await mount();
  expect(button('Confirm purchase')).toBeUndefined(); expect(button('Retry purchase approval')).toBeUndefined();
  if (status === 'submitted') { expect(button('Done')).toBeUndefined(); await press('Check purchase status'); expect(shop.checkStatus).toHaveBeenCalledTimes(1); }
  else { expect(button('Done')).toBeDefined(); expect(text(status === 'failed' ? 'PURCHASE FAILED' : 'PURCHASE EXPIRED')).toBe(true); }
  expect(shop.confirm).not.toHaveBeenCalled();
});
test('a different connected wallet cannot sign an existing order', async () => {
  external('other1111111111111111111111111111'); setShop({ hasPurchase: true, order }); await mount();
  expect(button('Confirm purchase').props.disabled).toBe(true);
  await press('Payment details');
  expect(text(order.buyer)).toBe(true); expect(shop.confirm).not.toHaveBeenCalled();
});

test.each([false, true])('store and email registration use figure/account language without crypto explanations (Seeker: %s)', async seeker => {
  if (seeker) external(null);
  await mount();
  await press(seeker ? 'Choose purchase wallet' : 'Register');
  const copy = tree.root.findAllByType(Text).flatMap(node => [node.props.children].flat(Infinity)).filter(value => typeof value === 'string').join(' ');
  expect(copy).not.toMatch(/\bmint(?:s|ing)?\b|\bNFTs?\b|metaplex|\bcore\b|self[- ]custodial|embedded|genesis token|mainnet|blockchain|network fees/i);
  if (!seeker) {
    expect(copy).not.toMatch(/wallet|\bSOL\b/i);
    expect(text('0.01 SOL')).toBe(false);
  }
  expect(shop.prepare).not.toHaveBeenCalled();
});

test('ordinary-phone purchases stay unavailable until store billing exists, even for a signed-in account and a general figure', async () => {
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: buyer });
  setShop({ catalog: { ...shop.catalog, figures: [{ ...fig2, seekerExclusive: false }] } });
  await mount();
  expect(button('Purchases coming soon').props.disabled).toBe(true);
  await press('Purchases coming soon');
  expect(shop.prepare).not.toHaveBeenCalled();
  expect(shop.confirm).not.toHaveBeenCalled();
  expect(text('0.01 SOL')).toBe(false);
  expect(text('Purchases on this device are coming soon.')).toBe(true);
});

test('technical purchase errors become actionable purchase messages, not raw payment terminology', async () => {
  setShop({ hasPurchase: true, order: { ...order, status: 'failed', error: 'Metaplex Core mint transaction simulation failed' }, error: 'Minting is not available yet.' });
  await mount();
  expect(text('Purchases are not available yet.')).toBe(true);
  expect(text('The purchase failed. Check its status before trying again.')).toBe(true);
  expect(text('Metaplex Core mint transaction simulation failed')).toBe(false);
  expect(text('Purchase not completed')).toBe(true);
  expect(button('Confirm purchase')).toBeUndefined();
});

test('test-mode purchase amounts cannot be mistaken for a real charge', async () => {
  external();
  setShop({ hasPurchase: true, order: { ...order, cluster: 'devnet' }, catalog: { ...shop.catalog, cluster: 'devnet' } });
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
