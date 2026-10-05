import { Platform } from 'react-native';

// UI eligibility only. The backend still verifies the receiving wallet's SGT.
// MWA availability on Android is not evidence that the phone is a Seeker.
export function isSeekerDevice(os = Platform.OS, model?: string): boolean {
  if (os !== 'android') return false;
  const deviceModel = model ?? (Platform.OS === 'android' ? Platform.constants.Model : '');
  return /\bseeker\b/i.test(deviceModel);
}
