import { installedApp, type InstalledApp } from './updates/app-info';
import { getGameWebSocketUrl } from './config';

export function appRequestHeaders(info: InstalledApp | null = installedApp()): Record<string, string> {
  if (!info || info.version.length > 40 || !/^\d+(?:\.\d+){1,3}(?:-[a-z\d.-]+)?$/i.test(info.version)
    || !Number.isSafeInteger(info.build) || info.build <= 0 || !['ios', 'android', 'seeker'].includes(info.channel)) return {};
  return { 'X-Ripsy-App-Version': info.version, 'X-Ripsy-App-Build': String(info.build),
    'X-Ripsy-App-Platform': info.channel === 'ios' ? 'ios' : 'android', 'X-Ripsy-App-Channel': info.channel };
}
function origin(value: string): string | null {
  // Also works with React Native's deliberately partial URL implementation.
  const match = /^(https?|wss?):\/\/([^/?#]+)/i.exec(value);
  if (!match || match[2].includes('@')) return null;
  const scheme = match[1].toLowerCase().replace(/^ws/, 'http');
  const host = match[2].toLowerCase().replace(scheme === 'https' ? /:443$/ : /:80$/, '');
  return `${scheme}://${host}`;
}
export function createApiMetadataFetch(fetcher: typeof fetch, endpoint: string, metadata = installedApp): typeof fetch {
  const apiOrigin = origin(endpoint);
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!apiOrigin || origin(url) !== apiOrigin) return fetcher(input, init);
    const requestHeaders = typeof input === 'object' && 'headers' in input ? input.headers : undefined;
    const headers = new Headers(init?.headers ?? requestHeaders);
    for (const [name, value] of Object.entries(appRequestHeaders(metadata()))) headers.set(name, value);
    return fetcher(input, { ...init, headers });
  };
}
type MetadataFetch = typeof fetch & { ripsyAppMetadata?: boolean };
/** Install before mounting the app or registering background handlers. Covers shared clients too. */
export function installApiRequestMetadata() {
  if ((globalThis.fetch as MetadataFetch).ripsyAppMetadata) return;
  const original = globalThis.fetch.bind(globalThis);
  const wrapped: MetadataFetch = createApiMetadataFetch(original, getGameWebSocketUrl());
  wrapped.ripsyAppMetadata = true;
  globalThis.fetch = wrapped;
}
/** React Native alone supports HTTP headers on the WebSocket upgrade request. */
export function nativeApiSocket(url: string) {
  const Socket = WebSocket as unknown as new (url: string, protocols: undefined, options: { headers: Record<string, string> }) => WebSocket;
  return new Socket(url, undefined, { headers: origin(url) === origin(getGameWebSocketUrl()) ? appRequestHeaders() : {} });
}
