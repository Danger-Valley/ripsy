import * as Keychain from 'react-native-keychain';

const keychainService = 'com.dangervalley.ripsy.active-game';
const gameIdPattern = /^[a-f0-9]{8}$/;

export async function loadActiveGameId(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service: keychainService });
  if (!credentials || !gameIdPattern.test(credentials.password)) return null;
  return credentials.password;
}

export async function saveActiveGameId(gameId: string | null): Promise<void> {
  if (!gameId) {
    await Keychain.resetGenericPassword({ service: keychainService });
    return;
  }
  if (!gameIdPattern.test(gameId)) throw new Error('Invalid game ID');
  await Keychain.setGenericPassword('ripsy-active-game', gameId, {
    service: keychainService,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
