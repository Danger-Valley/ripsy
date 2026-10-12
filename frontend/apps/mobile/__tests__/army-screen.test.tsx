import React from 'react';
import * as Native from 'react-native';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { colors } from '../src/theme';
import Renderer from 'react-test-renderer';
import { ShopClient } from '@rps/game-client/shop';
import { FIGURE_SLOTS, type FigureInventory } from '@rps/core/shop';
import { ArmyScreen } from '../src/screens/army-screen';
import { usePlayerIdentity } from '../src/hooks/use-player-identity';
import { useSolanaWallet } from '../src/hooks/use-solana-wallet';
import { usePrivyWallet } from '../src/hooks/use-privy-wallet';
import { saveFigureSlots } from '../src/storage/figure-loadout';

jest.mock('@rps/game-client/shop', () => ({ ShopClient: jest.fn() }));
jest.mock('../src/hooks/use-player-identity');
jest.mock('../src/hooks/use-solana-wallet');
jest.mock('../src/hooks/use-privy-wallet');
jest.mock('../src/storage/figure-loadout', () => ({ saveFigureSlots: jest.fn(() => Promise.resolve()) }));

const api = { inventory: jest.fn(), saveLoadout: jest.fn(), clearWallet: jest.fn(), walletChallenge: jest.fn(), verifyWallet: jest.fn() };
const navigate = jest.fn();
const goBack = jest.fn();
const addListener = jest.fn(() => jest.fn());
const disconnect = jest.fn(() => Promise.resolve());
const connect = jest.fn(() => Promise.resolve());
const proveWallet = jest.fn();
const wallet = 'wallet11111111111111111111111111111';
const asset = 'aaaa111111111111111111111111111111';
const inventory: FigureInventory = { wallet, slots: Array(FIGURE_SLOTS).fill(null), assets: [{ assetId: asset, figureId: 'fig2', name: 'Seeker fighter', imageUrl: 'https://example.test/figure.png' }] };
let tree: Renderer.ReactTestRenderer;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ShopClient).mockImplementation(() => api as unknown as ShopClient);
  jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: true, playerId: 'player', sessionToken: 'token', error: null });
  jest.mocked(useSolanaWallet).mockReturnValue({ address: null, label: null, status: 'disconnected', error: null, isSupported: false, connect, disconnect });
  jest.mocked(usePrivyWallet).mockReturnValue({ configured: true, address: null, error: null, activity: 'idle', status: 'unauthenticated', busy: false, refresh: jest.fn().mockResolvedValue(undefined), disconnect, proveWallet } as unknown as ReturnType<typeof usePrivyWallet>);
  api.inventory.mockRejectedValue(new Error('Verify a Solana wallet to manage your army.'));
  api.saveLoadout.mockImplementation(async slots => ({ ...inventory, slots }));
  api.clearWallet.mockResolvedValue(undefined);
  api.verifyWallet.mockResolvedValue(undefined);
});
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); });
async function mount(params?: { expectedAssetId?: string }) {
  await Renderer.act(async () => {
    tree = Renderer.create(<ArmyScreen navigation={{ navigate, goBack, addListener } as never} route={{ params } as never} />);
  });
}
function button(label: string) {
  const modal = tree.root.findByType(Modal);
  return (modal.props.visible ? modal : tree.root).findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
}
async function press(label: string) { await Renderer.act(async () => { await button(label).props.onPress(); }); }
function slot(index: number) { return tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(`Army slot ${index},`) && typeof node.props.onPress === 'function')[0]; }

test('All figures omits the free-starter promotion without replacing it with an empty hint', async () => {
  await mount();
  await press('All figures');
  const labels = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(labels).not.toContain('RIPSY 001 is free. Discover more fighters in the shop.');
  expect(labels).not.toContain('Each collectible fills one slot. Free fighters fill the rest.');
  expect(button('Use free RIPSY 001')).toBeDefined();
  await press('My collection');
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('Each collectible fills one slot. Free fighters fill the rest.');
});

test('shows all fourteen free fighters before verification, with no expected-auth error', async () => {
  await mount();
  for (let index = 1; index <= FIGURE_SLOTS; index++) expect(slot(index).props.accessibilityLabel).toContain('free RIPSY 001');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Verify a Solana wallet to manage your army.')).toBe(false);
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'army-header' }).props.style).paddingTop).toBeGreaterThanOrEqual(8);
});

test('non-Seeker Register opens email sign-in directly instead of an external wallet selector', async () => {
  await mount(); await press('Register');
  expect(navigate).toHaveBeenCalledWith('Shop', { signIn: true });
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(button('Connect your wallet')).toBeUndefined();
  expect(tree.root.findAllByType(Text).some(node => /privy/i.test(String(node.props.children)))).toBe(false);
});

test('owned figures and account settings use collection copy without payment internals', async () => {
  api.inventory.mockResolvedValue(inventory);
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: wallet });
  await mount();
  await press('Manage collection');
  const copy = tree.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
  expect(copy).toContain('OWNED');
  expect(copy).toContain('Your collection');
  expect(copy).toContain('In your collection');
  expect(copy).not.toMatch(/\bNFTs?\b|\bmint\b|Metaplex|self-custodial|embedded wallet|Privy|SGT|\bSOL\b/i);
  expect(copy).not.toContain(wallet);
  expect(copy).not.toContain(asset);
  expect(button('Sign out')).toBeDefined();
});

test('Seeker Army offers only wallet connection, never an email alternative', async () => {
  jest.mocked(useSolanaWallet).mockReturnValue({ ...jest.mocked(useSolanaWallet)(), isSupported: true });
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: wallet, error: 'Sign in with email unavailable' });
  await mount(); await press('Manage collection');
  await press('Connect your wallet');
  expect(jest.mocked(useSolanaWallet)().connect).toHaveBeenCalledTimes(1);
  expect(button('Sign in with email')).toBeUndefined();
  expect(button('Use email account')).toBeUndefined();
  expect(button('Register')).toBeUndefined();
  expect(button('Load my figures').props.disabled).toBe(true);
  expect(tree.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).not.toMatch(/email/i);
  expect(navigate).not.toHaveBeenCalled();
  expect(usePrivyWallet).toHaveBeenCalledWith(false);
});

test.each(['unverified', 'empty', 'offline'])('My collection shows only the free starter when inventory is %s', async state => {
  if (state === 'empty') api.inventory.mockResolvedValue({ ...inventory, assets: [] });
  if (state === 'offline') api.inventory.mockRejectedValue(new Error('Network unavailable'));
  await mount();
  expect(button('Use free RIPSY 001')).toBeDefined();
  expect(button('Visit shop')).toBeUndefined();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Seeker fighter')).toBe(false);

  await press('All figures');
  expect(button('Visit shop')).toBeDefined();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Seeker fighter')).toBe(true);
  await press('My collection');
  expect(button('Visit shop')).toBeUndefined();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Seeker fighter')).toBe(false);
});

test('an owned Seeker fighter is available on iPhone even though native Seeker minting is unsupported', async () => {
  expect(jest.mocked(useSolanaWallet)().isSupported).toBe(false);
  api.inventory.mockResolvedValue(inventory);
  await mount();
  expect(button('Use free RIPSY 001')).toBeDefined();
  expect(button('Equip Seeker fighter aaaa…1111')).toBeDefined();
  expect(button('Visit shop')).toBeUndefined();
});

test('free army saves locally without a wallet or backend mutation, even offline', async () => {
  jest.mocked(usePlayerIdentity).mockReturnValue({ isReady: false, playerId: '', sessionToken: '', error: null });
  await mount();
  await press('Save army');
  expect(saveFigureSlots).toHaveBeenCalledWith(Array(FIGURE_SLOTS).fill(null));
  expect(api.saveLoadout).not.toHaveBeenCalled();
});

test('owned BONK/Jup/ORE can be placed in distinct slots with their real names and cached identities', async () => {
  const assets: FigureInventory['assets'] = [
    { ...inventory.assets[0], figureId: 'bonk', name: 'BONK' },
    { assetId: 'bbbb222222222222222222222222222222', figureId: 'jup', name: 'Jup', imageUrl: '/figures/jup.png' },
    { assetId: 'cccc333333333333333333333333333333', figureId: 'ore', name: 'ORE', imageUrl: '/figures/ore.png' },
  ];
  api.inventory.mockResolvedValue({ ...inventory, assets });
  api.saveLoadout.mockImplementation(async slots => ({ ...inventory, assets, slots }));
  await mount();
  await Renderer.act(() => slot(2).props.onPress());
  await press('Equip BONK aaaa…1111');
  await Renderer.act(() => slot(6).props.onPress());
  await press('Equip Jup bbbb…2222');
  await Renderer.act(() => slot(9).props.onPress());
  await press('Equip ORE cccc…3333');
  expect(slot(2).props.accessibilityLabel).toContain('BONK');
  expect(slot(6).props.accessibilityLabel).toContain('Jup');
  expect(slot(9).props.accessibilityLabel).toContain('ORE');
  await press('Save army');
  const slots = api.saveLoadout.mock.calls[0][0];
  expect(slots.filter(Boolean)).toEqual(assets.map(owned => owned.assetId));
  expect(saveFigureSlots).toHaveBeenCalledWith(slots, assets);
});

test('equips a collectible in the selected slot and never duplicates that NFT', async () => {
  api.inventory.mockResolvedValue(inventory);
  await mount();
  await Renderer.act(() => slot(4).props.onPress());
  await press('Equip Seeker fighter aaaa…1111');
  expect(slot(4).props.accessibilityLabel).toContain('Seeker fighter');
  await press('Save army');
  const savedSlots = api.saveLoadout.mock.calls[0][0];
  expect(savedSlots[3]).toBe(asset);
  expect(savedSlots.filter((value: string | null) => value === asset)).toHaveLength(1);
  await press('Remove Seeker fighter aaaa…1111');
  expect(slot(4).props.accessibilityLabel).toContain('free RIPSY 001');
});

test('free RIPSY 001 replaces only the chosen collectible slot', async () => {
  api.inventory.mockResolvedValue({ ...inventory, slots: [asset, ...Array(13).fill(null)] });
  await mount();
  await Renderer.act(() => slot(1).props.onPress());
  await press('Use free RIPSY 001');
  expect(slot(1).props.accessibilityLabel).toContain('free RIPSY 001');
  await press('Save army');
  expect(api.saveLoadout).toHaveBeenCalledWith(Array(FIGURE_SLOTS).fill(null));
});

test('wallet management opens separately and disconnect preserves the free army', async () => {
  api.inventory.mockResolvedValue(inventory);
  jest.mocked(usePrivyWallet).mockReturnValue({ ...jest.mocked(usePrivyWallet)(), address: wallet });
  await mount();
  await press('Manage collection');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  await press('Sign out');
  expect(api.clearWallet).toHaveBeenCalledTimes(1);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(saveFigureSlots).toHaveBeenLastCalledWith(Array(FIGURE_SLOTS).fill(null));
  expect(slot(1).props.accessibilityLabel).toContain('free RIPSY 001');
  await press('Close collection settings');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(button('Equip Seeker fighter aaaa…1111')).toBeUndefined();
  expect(button('Visit shop')).toBeUndefined();
});

test('All figures opens the shop instead of equipping an unowned collectible', async () => {
  api.inventory.mockResolvedValue(inventory);
  await mount();
  await press('All figures');
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Equip Seeker fighter aaaa…1111')).toHaveLength(0);
  await press('Visit shop');
  expect(navigate).toHaveBeenCalledWith('Shop');
});

test('save failure remains visible and cannot claim that the army was saved', async () => {
  api.inventory.mockResolvedValue(inventory);
  api.saveLoadout.mockRejectedValue(new Error('Could not save your army.'));
  await mount();
  await press('Save army');
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Could not save your army.')).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Saved ✓')).toBe(false);
});

test('a full army requires a selected slot and replaces only that NFT', async () => {
  const assets = Array.from({ length: 15 }, (_, index) => ({ ...inventory.assets[0], assetId: `asset-${index}`, name: `Fighter ${index}` }));
  api.inventory.mockResolvedValue({ ...inventory, assets, slots: assets.slice(0, 14).map(owned => owned.assetId) });
  await mount();
  const label = 'Equip Fighter 14 asse…t-14';
  expect(button(label).props.disabled).toBe(true);
  await Renderer.act(() => slot(6).props.onPress());
  expect(button(label).props.disabled).toBe(false);
  await press(label);
  await press('Save army');
  expect(api.saveLoadout).toHaveBeenCalledWith(assets.slice(0, 14).map((owned, index) => index === 5 ? 'asset-14' : owned.assetId));
});

test('reset only changes the draft and never disconnects or deletes a collectible', async () => {
  api.inventory.mockResolvedValue({ ...inventory, slots: [asset, ...Array(13).fill(null)] });
  await mount();
  await press('Reset all slots to free RIPSY 001');
  expect(api.saveLoadout).not.toHaveBeenCalled();
  expect(api.clearWallet).not.toHaveBeenCalled();
  expect(slot(1).props.accessibilityLabel).toContain('free RIPSY 001');
  expect(button('Equip Seeker fighter aaaa…1111')).toBeDefined();
  await press('Save army');
  expect(api.saveLoadout).toHaveBeenCalledWith(Array(FIGURE_SLOTS).fill(null));
});

test('a network inventory error remains visible without inventing owned figures', async () => {
  api.inventory.mockRejectedValue(new Error('Network unavailable'));
  await mount();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Network unavailable')).toBe(true);
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Equip Seeker fighter aaaa…1111')).toHaveLength(0);
  expect(slot(1).props.accessibilityLabel).toContain('free RIPSY 001');
});

test('lineup labels explain the actual free and collectible split, not fake progress', async () => {
  api.inventory.mockResolvedValue(inventory);
  await mount();
  expect(tree.root.findByProps({ testID: 'army-lineup-count' }).props.children).toBe('14 free · 0 collectibles');
  expect(tree.root.findAllByType(Text).some(node => String(node.props.children).includes('14/14'))).toBe(false);
  await Renderer.act(() => slot(4).props.onPress());
  expect(tree.root.findByProps({ testID: 'army-slot-hint' }).props.children).toBe('Choose a fighter for slot 4');
  await press('Equip Seeker fighter aaaa…1111');
  expect(tree.root.findByProps({ testID: 'army-lineup-count' }).props.children).toBe('13 free · 1 collectible');
});

test('lineup uses the collection panel without wooden artwork or nested label backgrounds', async () => {
  await mount();
  expect(tree.root.findAllByType(Image).some(node => node.props.source === require('../src/assets/ui/army-wood-tray.png'))).toBe(false);
  const panel = tree.root.findAllByType(View).find(node => node.props.testID === 'army-lineup-panel')!;
  expect(StyleSheet.flatten(panel.props.style).borderRadius).toBe(22);
  const header = tree.root.findByProps({ testID: 'army-lineup-header' });
  const hint = tree.root.findByProps({ testID: 'army-slot-hint' });
  expect(StyleSheet.flatten(header.props.style).backgroundColor).toBeUndefined();
  expect(StyleSheet.flatten(hint.props.style).backgroundColor).toBeUndefined();
  for (let index = 1; index <= FIGURE_SLOTS; index++) {
    const number = slot(index).findAllByType(Text).find(node => node.props.children === index)!;
    const style = StyleSheet.flatten(number.props.style);
    expect(number.parent!.props.accessibilityLabel).toContain(`Army slot ${index},`);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
    expect(style.bottom).toBeGreaterThanOrEqual(4);
  }
  await Renderer.act(() => slot(14).props.onPress());
  expect(hint.props.children).toBe('Choose a fighter for slot 14');
  expect(StyleSheet.flatten(hint.props.style).backgroundColor).toBeUndefined();
});

test.each([[320, 1], [375, 1], [768, 1], [1280, 1], [320, 2], [375, 2]])(
  'lightweight lineup keeps wrapping labels and usable slots at width %i and font scale %i', async (width, fontScale) => {
    const windowMock = jest.spyOn(jest.requireActual<typeof Native>('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 844, scale: 3, fontScale });
    try {
      await mount();
      const panel = tree.root.findAllByType(View).find(node => node.props.testID === 'army-lineup-panel')!;
      const panelStyle = StyleSheet.flatten(panel.props.style);
      expect(panelStyle.padding).toBe(12);
      const scroll = tree.root.findByProps({ testID: 'army-slots-scroll' });
      const gridStyle = StyleSheet.flatten(scroll.findAllByType(View).find(node => StyleSheet.flatten(node.props.style)?.width)?.props.style);
      expect(gridStyle.width).toBe(Math.max(7 * 44 + 6 * 4, Math.min(width, 720) - 28 - 2 * (panelStyle.padding + panelStyle.borderWidth)));
      for (const testID of ['army-lineup-count', 'army-slot-hint']) {
        const label = tree.root.findByProps({ testID });
        expect(label.props.numberOfLines).toBeUndefined();
        expect(label.props.adjustsFontSizeToFit).toBeUndefined();
        expect(StyleSheet.flatten(label.props.style).height).toBeUndefined();
        expect(StyleSheet.flatten(label.props.style).backgroundColor).toBeUndefined();
      }
      expect(StyleSheet.flatten(button('Reset all slots to free RIPSY 001').props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(44);
    } finally { windowMock.mockRestore(); }
  },
);

test('cyan slot selection is visible without changing its dimensions and tapping again clears it', async () => {
  await mount();
  const normal = StyleSheet.flatten(slot(3).props.style({ pressed: false }));
  expect(normal.backgroundColor).toBe(colors.collectionMuted);
  await Renderer.act(() => slot(3).props.onPress());
  const selected = StyleSheet.flatten(slot(3).props.style({ pressed: false }));
  expect(selected.backgroundColor).toBe(colors.accentHighlight);
  expect(selected.borderColor).toBe(colors.ink);
  expect(selected.borderWidth).toBe(normal.borderWidth);
  expect(selected.aspectRatio).toBe(normal.aspectRatio);
  expect(slot(3).props.accessibilityState.selected).toBe(true);
  await Renderer.act(() => slot(3).props.onPress());
  expect(slot(3).props.accessibilityState.selected).toBe(false);
});

test('free card tells users to choose a slot before enabling the fighter action', async () => {
  await mount();
  expect(button('Use free RIPSY 001').props.disabled).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Pick a slot')).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Ready!')).toBe(false);
  await Renderer.act(() => slot(2).props.onPress());
  expect(button('Use free RIPSY 001').props.disabled).toBe(false);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Use fighter')).toBe(true);
});

test('saving copy describes the actual operation and saved state locks repeat submission', async () => {
  let finishSave!: () => void;
  jest.mocked(saveFigureSlots).mockReturnValueOnce(new Promise<void>(resolve => { finishSave = resolve; }));
  await mount();
  await press('Save army');
  expect(button('Save army').props.busy).toBe(true);
  const copy = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(copy).toContain('Saving army…');
  expect(copy).toContain('Saving your army…');
  expect(copy).not.toContain('Loading your collection…');
  await Renderer.act(async () => finishSave());
  expect(button('Army saved').props.disabled).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Saved ✓')).toBe(true);
  await Renderer.act(() => slot(1).props.onPress());
  await press('Use free RIPSY 001');
  expect(button('Save army').props.disabled).toBe(false);
});

test.each([320, 375, 768, 1280])('slots and fighter cards retain usable sizes at %i points', async width => {
  const windowMock = jest.spyOn(jest.requireActual<typeof Native>('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 844, scale: 3, fontScale: 1 });
  try {
    await mount();
    const scroll = tree.root.findByProps({ testID: 'army-slots-scroll' });
    expect(scroll.props.horizontal).toBe(true);
    const slotStyle = StyleSheet.flatten(slot(1).props.style({ pressed: false }));
    expect(slotStyle.minWidth).toBeGreaterThanOrEqual(44);
    const card = tree.root.findAllByType(Text).find(node => node.props.children === 'Your free starter')!;
    expect(StyleSheet.flatten(card.props.style).fontSize).toBeGreaterThanOrEqual(12);
    expect(card.props.numberOfLines).toBeUndefined();
  } finally { windowMock.mockRestore(); }
});

test('figure badges are readable and no longer positioned over the artwork', async () => {
  await mount();
  const badge = tree.root.findAllByType(Text).find(node => node.props.children === 'FREE')!;
  expect(StyleSheet.flatten(badge.props.style).fontSize).toBeGreaterThanOrEqual(12);
  expect(StyleSheet.flatten(badge.parent!.props.style).position).not.toBe('absolute');
});

test('Army controls paint a visible focus ring above their content', async () => {
  await mount();
  const control = tree.root.findAll(node => node.props.accessibilityLabel === 'All figures' && typeof node.props.onFocus === 'function')[0];
  await Renderer.act(() => control.props.onFocus({}));
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'army-control-focus' }).props.style).borderWidth).toBe(2);
  await Renderer.act(() => control.props.onBlur({}));
  expect(tree.root.findAllByProps({ testID: 'army-control-focus' })).toHaveLength(0);
});
