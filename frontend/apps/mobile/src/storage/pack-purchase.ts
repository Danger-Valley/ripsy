import * as Keychain from 'react-native-keychain';
import type { PurchaseStorage } from '@rps/game-client/use-shop';

const service = 'com.dangervalley.ripsy.pack-purchase';
export const packPurchaseStorage: PurchaseStorage = {
  async load() {
    const value = await Keychain.getGenericPassword({ service });
    return value ? value.password : null;
  },
  async save(value) {
    if (value === null) {
      if (!(await Keychain.resetGenericPassword({ service })))
        throw new Error('Could not close the completed pack. Try again.');
    } else if (
      !(await Keychain.setGenericPassword('ripsy-pack', value, {
        service,
        accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }))
    ) {
      throw new Error(
        'Could not save pack recovery data. No new payment will be sent.',
      );
    }
  },
};
