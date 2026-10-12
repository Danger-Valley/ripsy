import type { IncomingHttpHeaders } from 'node:http';

export type AppRequestMetadata = { version: string; build: number; platform: 'ios' | 'android'; channel: 'ios' | 'android' | 'seeker' };
/** Advisory compatibility data only. Never use these spoofable headers as authorization. */
export function readAppRequestMetadata(headers: IncomingHttpHeaders): AppRequestMetadata | null {
  const version = headers['x-ripsy-app-version'];
  const rawBuild = headers['x-ripsy-app-build'];
  const platform = headers['x-ripsy-app-platform'];
  const channel = headers['x-ripsy-app-channel'];
  if (typeof version !== 'string' || version.length > 40 || !/^\d+(?:\.\d+){1,3}(?:-[a-z\d.-]+)?$/i.test(version)
    || typeof rawBuild !== 'string' || !/^[1-9]\d{0,9}$/.test(rawBuild) || !Number.isSafeInteger(Number(rawBuild))
    || typeof platform !== 'string' || typeof channel !== 'string' || !['ios', 'android'].includes(platform) || !['ios', 'android', 'seeker'].includes(channel)
    || (platform === 'ios') !== (channel === 'ios')) return null;
  return { version, build: Number(rawBuild), platform: platform as AppRequestMetadata['platform'], channel: channel as AppRequestMetadata['channel'] };
}
/** Logs retain a route family, never user-controlled path segments or query strings. */
export function apiRouteFamily(path: string): 'shop' | 'session' | 'push' | 'updates' | 'other' {
  return path.startsWith('/shop/') ? 'shop' : path === '/session' ? 'session' : path === '/push/installations' ? 'push' : path === '/mobile/update-policy' ? 'updates' : 'other';
}
