import { NativeModules, Platform } from 'react-native';
import type { UpdateChannel } from '@rps/core/app-updates';
import { isSeekerDevice } from '../seeker-device';

export type InstalledApp = { build: number; version: string; channel: UpdateChannel };

export function updateChannel(os: string, installer: string, seeker: boolean): UpdateChannel | null {
  if (os === 'ios') return 'ios';
  if (os !== 'android') return null;
  // A Play-installed copy must go back to Play, even on Seeker hardware.
  return installer === 'com.android.vending' || !seeker ? 'android' : 'seeker';
}

export function installedApp(): InstalledApp | null {
  const info = NativeModules.RipsyAppInfo;
  const channel = updateChannel(Platform.OS, info?.installer ?? '', isSeekerDevice());
  const raw = info?.buildNumber;
  const build = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!channel || !Number.isSafeInteger(build) || build <= 0) return null;
  return { build, version: typeof info.version === 'string' ? info.version : '', channel };
}
