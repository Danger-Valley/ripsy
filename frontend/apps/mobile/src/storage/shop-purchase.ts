import * as Keychain from 'react-native-keychain';
import type { PurchaseStorage } from '@rps/game-client/use-shop';

const service = 'com.dangervalley.ripsy.shop-purchase';
export const shopPurchaseStorage: PurchaseStorage = {
  async load() {
    const credentials = await Keychain.getGenericPassword({ service });
    return credentials ? credentials.password : null;
  },
  async save(value) {
    if (value === null) {
      if (!await Keychain.resetGenericPassword({ service })) throw new Error('Could not clear the completed purchase. Try again.');
      return;
    }
    const result = await Keychain.setGenericPassword('ripsy-purchase', value, { service, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    if (!result) throw new Error('Could not save purchase recovery data. No new transaction will be sent.');
  },
};
