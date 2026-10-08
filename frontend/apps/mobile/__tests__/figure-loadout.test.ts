import * as Keychain from 'react-native-keychain';
import { equippedFigureVariant, type OwnedFigureAsset } from '@rps/core/shop';
import { loadFigureSlots, loadFigureVariants, saveFigureSlots } from '../src/storage/figure-loadout';

beforeEach(() => jest.clearAllMocks());

test('ORE identity and exact asset slot survive offline cache restoration', async () => {
  const assets: OwnedFigureAsset[] = [{ assetId: 'ore-asset', figureId: 'ore', name: 'ORE', imageUrl: '/figures/ore.png' }];
  const slots = ['ore-asset', ...Array(13).fill(null)];
  await saveFigureSlots(slots, assets);
  const writes = jest.mocked(Keychain.setGenericPassword).mock.calls;
  expect(JSON.parse(writes[0][1])).toEqual({ 'ore-asset': 5 });
  expect(JSON.parse(writes[1][1])).toEqual(slots);
  jest.mocked(Keychain.getGenericPassword)
    .mockResolvedValueOnce({ username: 'ripsy', password: writes[0][1], service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH })
    .mockResolvedValueOnce({ username: 'ripsy', password: writes[1][1], service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  const variants = await loadFigureVariants();
  const restored = await loadFigureSlots();
  expect(equippedFigureVariant(restored[0], variants)).toBe(5);
  expect(equippedFigureVariant(restored[1], variants)).toBe(1);
});

test('future model caches and legacy fig2 caches remain supported', async () => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({
    username: 'ripsy', password: JSON.stringify({ unsupported: 6 }), service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });
  expect(await loadFigureVariants()).toEqual({ unsupported: 6 });
  expect(equippedFigureVariant('legacy-asset', {})).toBe(2);
});

test.each([0, 256, 1.5, -1, '6'])('invalid cached variant %s is rejected', async variant => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({ username: 'ripsy', password: JSON.stringify({ bad: variant }), service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  expect(await loadFigureVariants()).toEqual({});
});

test('a future server mapping persists without a client ID entry', async () => {
  await saveFigureSlots(['future-asset', ...Array(13).fill(null)], [{ assetId: 'future-asset', figureId: 'future-fighter', variant: 42, name: 'Future fighter', imageUrl: 'https://www.ripsy.fun/new.png' }]);
  expect(JSON.parse(jest.mocked(Keychain.setGenericPassword).mock.calls[0][1])).toEqual({ 'future-asset': 42 });
});
