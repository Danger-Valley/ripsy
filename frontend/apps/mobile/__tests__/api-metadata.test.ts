import { NativeModules } from 'react-native';
import { appRequestHeaders, createApiMetadataFetch, installApiRequestMetadata, nativeApiSocket } from '../src/api-metadata';
import { requestPlayerSession } from '@rps/game-client/session';
import { ShopClient } from '@rps/game-client/shop';
import { readFileSync } from 'node:fs';

const info = { version: '1.0.0', build: 63, channel: 'seeker' as const };
const originalFetch = globalThis.fetch;
const originalInfo = NativeModules.RipsyAppInfo;
afterEach(() => { globalThis.fetch = originalFetch; NativeModules.RipsyAppInfo = originalInfo; jest.restoreAllMocks(); });

test.each(['/session', '/shop/catalog', '/shop/orders', '/shop/packs/orders/abc/submit', '/shop/loadout', '/push/installations', '/mobile/update-policy'])('first-party %s includes native version/build and retains authentication/body/signal', async path => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true });
  const request = createApiMetadataFetch(fetcher, 'wss://api.ripsy.fun', () => info);
  const controller = new AbortController();
  await request(`https://api.ripsy.fun${path}`, { method: 'POST', headers: { authorization: 'Bearer test-only-token', 'content-type': 'application/json', 'X-Ripsy-App-Build': 'old-value' }, body: '{}', signal: controller.signal });
  const options = fetcher.mock.calls[0][1]; const headers = new Headers(options.headers);
  expect(headers.get('x-ripsy-app-version')).toBe('1.0.0'); expect(headers.get('x-ripsy-app-build')).toBe('63');
  expect(headers.get('x-ripsy-app-platform')).toBe('android'); expect(headers.get('x-ripsy-app-channel')).toBe('seeker');
  expect(headers.get('authorization')).toBe('Bearer test-only-token'); expect(headers.get('content-type')).toBe('application/json');
  expect(options).toMatchObject({ body: '{}', method: 'POST', signal: controller.signal });
});
test.each(['https://auth.privy.io/session', 'https://api.jup.ag/quote', 'https://api.ripsy.fun.evil.test/shop', 'https://api.ripsy.fun@evil.test/shop', 'https://www.ripsy.fun/figures/fig2.riv'])('never decorates third-party request %s', async url => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true }); const options = { headers: { Accept: 'application/json' } };
  await createApiMetadataFetch(fetcher, 'https://api.ripsy.fun', () => info)(url, options);
  expect(fetcher).toHaveBeenCalledWith(url, options); expect(fetcher.mock.calls[0][1]).toBe(options);
});
test('Request headers and explicit header overrides obey normal fetch semantics', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true }); const run = createApiMetadataFetch(fetcher, 'https://api.ripsy.fun', () => info);
  const input = new Request('https://api.ripsy.fun/shop/catalog', { headers: { authorization: 'Bearer request-token' } });
  await run(input); expect(new Headers(fetcher.mock.calls[0][1].headers).get('authorization')).toBe('Bearer request-token');
  await run(input, { headers: [['authorization', 'Bearer override-token']] });
  expect(new Headers(fetcher.mock.calls[1][1].headers).get('authorization')).toBe('Bearer override-token');
});
test('missing native metadata never invents a marketing version or a build number', async () => {
  expect(appRequestHeaders(null)).toEqual({});
  expect(appRequestHeaders({ ...info, version: '1.0.0\nprivate' })).toEqual({});
  expect(appRequestHeaders({ ...info, build: 0 })).toEqual({});
});
test('entry-point installation is idempotent and covers the shared session and ShopClient fetch paths', async () => {
  NativeModules.RipsyAppInfo = { version: '1.0.0', buildNumber: '63' };
  const fetcher = jest.fn().mockImplementation(async function (this: unknown, url: string) {
    expect(this).toBe(globalThis);
    return { ok: true, json: async () => url.endsWith('/session') ? { token: 'token', playerId: 'player', expiresAt: 'future' } : { cluster: 'devnet', treasury: null, collection: null, figures: [] } };
  });
  globalThis.fetch = fetcher;
  installApiRequestMetadata(); const installed = globalThis.fetch; installApiRequestMetadata(); expect(globalThis.fetch).toBe(installed);
  await requestPlayerSession('http://localhost:8080/session'); await new ShopClient('http://localhost:8080', 'token').catalog();
  for (const call of fetcher.mock.calls) expect(new Headers(call[1].headers).get('x-ripsy-app-build')).toBe('63');
  const entry = readFileSync(require.resolve('../index.js'), 'utf8');
  expect(entry.indexOf('installApiRequestMetadata();')).toBeLessThan(entry.indexOf('installBackgroundPushHandler();'));
});
test('native WebSocket upgrade carries the same installed metadata', () => {
  NativeModules.RipsyAppInfo = { version: '1.0.0', buildNumber: '63' };
  const socket = jest.spyOn(globalThis, 'WebSocket').mockImplementation(() => ({} as WebSocket));
  nativeApiSocket('ws://localhost:8080');
  expect(socket).toHaveBeenCalledWith('ws://localhost:8080', undefined, { headers: expect.objectContaining({ 'X-Ripsy-App-Version': '1.0.0', 'X-Ripsy-App-Build': '63' }) });
});
