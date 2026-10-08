import { NativeModules, Platform } from 'react-native';
import { installedApp, updateChannel } from '../src/updates/app-info';

test.each([
  ['ios', '', false, 'ios'], ['android', 'com.android.vending', true, 'android'],
  ['android', '', true, 'seeker'], ['android', 'some.installer', true, 'seeker'],
  ['android', '', false, 'android'], ['web', '', false, null],
])('routes %s installer=%s Seeker=%s to %s', (os, installer, seeker, expected) => {
  expect(updateChannel(os, installer, seeker)).toBe(expected);
});

test('reads actual native build metadata and rejects unsupported/non-integer build values', () => {
  const previous = NativeModules.RipsyAppInfo;
  try {
    expect(Platform.OS).toBe('ios');
    for (const buildNumber of [undefined, '1.2.3', '57abc', '-1', '0', '9007199254740992', 57]) {
      NativeModules.RipsyAppInfo = { buildNumber, version: '1.0.0' };
      expect(installedApp()).toBeNull();
    }
    NativeModules.RipsyAppInfo = { buildNumber: '57', version: '1.0.0', installer: '' };
    expect(installedApp()).toEqual({ build: 57, version: '1.0.0', channel: 'ios' });
  } finally { NativeModules.RipsyAppInfo = previous; }
});
