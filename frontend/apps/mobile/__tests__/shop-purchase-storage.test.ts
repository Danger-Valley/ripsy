import * as Keychain from 'react-native-keychain';
import { shopPurchaseStorage } from '../src/storage/shop-purchase';

beforeEach(() => jest.clearAllMocks());

test('uses an isolated device-only Keychain service for purchase recovery', async () => {
  await shopPurchaseStorage.save('purchase');
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith('ripsy-purchase', 'purchase', expect.objectContaining({ service: 'com.dangervalley.ripsy.shop-purchase', accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }));
  await shopPurchaseStorage.save(null);
  expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'com.dangervalley.ripsy.shop-purchase' });
});

test('a refused secure storage write fails before a purchase can proceed', async () => {
  jest.mocked(Keychain.setGenericPassword).mockResolvedValueOnce(false);
  await expect(shopPurchaseStorage.save('purchase')).rejects.toThrow('recovery data');
});
