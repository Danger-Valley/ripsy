import * as Keychain from 'react-native-keychain';
import { FIGURE_SLOTS, figureAssetVariants, type OwnedFigureAsset } from '@rps/core/shop';

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

export async function loadFigureVariants(): Promise<Record<string, number>> {
  const credentials = await Keychain.getGenericPassword({ service: `${service}.variants` });
  if (!credentials) return {};
  try {
    const value = JSON.parse(credentials.password) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(variant => typeof variant === 'number' && [1, 2, 3, 4].includes(variant))) return value as Record<string, number>;
  } catch {}
  return {};
}

export async function saveFigureSlots(slots: Array<string | null>, assets?: OwnedFigureAsset[]): Promise<void> {
  if (slots.length !== FIGURE_SLOTS || !slots.every(item => item === null || typeof item === 'string')) throw new Error('Invalid figure loadout');
  // Write model identities first so a failed write cannot expose new asset slots
  // with a stale fig2-only model cache.
  if (assets || slots.every(slot => slot === null)) {
    await Keychain.setGenericPassword('ripsy-figure-variants', JSON.stringify(figureAssetVariants(assets ?? [])), { service: `${service}.variants`, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  }
  await Keychain.setGenericPassword('ripsy-figure-loadout', JSON.stringify(slots), {
    service,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
