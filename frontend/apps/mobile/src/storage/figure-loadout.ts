import * as Keychain from 'react-native-keychain';
import { FIGURE_SLOTS } from '@rps/core/shop';

const service = 'com.dangervalley.ripsy.figure-loadout';

export async function loadFigureSlots(): Promise<Array<string | null>> {
  const credentials = await Keychain.getGenericPassword({ service });
  if (!credentials) return Array<string | null>(FIGURE_SLOTS).fill(null);
  try {
    const value = JSON.parse(credentials.password) as unknown;
    if (Array.isArray(value) && value.length === FIGURE_SLOTS && value.every(item => item === null || typeof item === 'string')) return value;
  } catch {}
  return Array<string | null>(FIGURE_SLOTS).fill(null);
}

export async function saveFigureSlots(slots: Array<string | null>): Promise<void> {
  if (slots.length !== FIGURE_SLOTS || !slots.every(item => item === null || typeof item === 'string')) throw new Error('Invalid figure loadout');
  await Keychain.setGenericPassword('ripsy-figure-loadout', JSON.stringify(slots), {
    service,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
