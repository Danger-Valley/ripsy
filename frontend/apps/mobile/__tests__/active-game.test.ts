import * as Keychain from 'react-native-keychain';
import { loadActiveGameId, saveActiveGameId } from '../src/storage/active-game';

const getGenericPassword = Keychain.getGenericPassword as jest.MockedFunction<typeof Keychain.getGenericPassword>;
const setGenericPassword = Keychain.setGenericPassword as jest.MockedFunction<typeof Keychain.setGenericPassword>;
const resetGenericPassword = Keychain.resetGenericPassword as jest.MockedFunction<typeof Keychain.resetGenericPassword>;

beforeEach(() => {
  jest.clearAllMocks();
  getGenericPassword.mockResolvedValue(false);
});

test('loads and validates a stored active game ID', async () => {
  getGenericPassword.mockResolvedValue({ username: 'ripsy-active-game', password: 'abcdef12', service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  await expect(loadActiveGameId()).resolves.toBe('abcdef12');

  getGenericPassword.mockResolvedValue({ username: 'ripsy-active-game', password: 'not-a-room', service: 'test', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH });
  await expect(loadActiveGameId()).resolves.toBeNull();
});

test('persists and clears the active game ID', async () => {
  await saveActiveGameId('abcdef12');
  expect(setGenericPassword).toHaveBeenCalledWith('ripsy-active-game', 'abcdef12', expect.objectContaining({
    service: 'com.dangervalley.ripsy.active-game',
  }));

  await saveActiveGameId(null);
  expect(resetGenericPassword).toHaveBeenCalledWith({ service: 'com.dangervalley.ripsy.active-game' });
});
