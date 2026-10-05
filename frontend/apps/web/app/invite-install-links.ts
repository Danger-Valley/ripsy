import { DEFAULT_ANDROID_INSTALL_URL, DEFAULT_TESTFLIGHT_URL, type InviteInstallLinks } from '@rps/core/invitations';
export function installUrl(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.toString();
  } catch {}
  return fallback;
}
/** Vercel-only settings; the native QR never hard-codes a store destination. */
export function getInviteInstallLinks(): InviteInstallLinks {
  const android = installUrl(process.env.RIPSY_ANDROID_INSTALL_URL, DEFAULT_ANDROID_INSTALL_URL);
  return {
    ios: installUrl(process.env.RIPSY_IOS_INSTALL_URL, DEFAULT_TESTFLIGHT_URL),
    android,
    seeker: installUrl(process.env.RIPSY_SEEKER_INSTALL_URL, android),
  };
}
