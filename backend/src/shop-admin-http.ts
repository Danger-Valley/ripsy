import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-json.js';
import type { ShopAdminAuth } from './shop-admin-auth.js';
import type { ShopAdminService } from './shop-admin.js';
import type { ShopPricingService } from './shop-pricing.js';

interface AdminHttpDependencies {
  auth: ShopAdminAuth; service: ShopAdminService; prices: ShopPricingService;
  verifyPlayer(authorization: string | undefined): string;
  readBody(request: IncomingMessage): Promise<Record<string, unknown>>;
}
/** Caller applies exact-origin CORS, no-store, OPTIONS and safe error JSON. */
export async function handleShopAdmin(request: IncomingMessage, response: ServerResponse, path: string, d: AdminHttpDependencies) {
  if (request.method === 'GET' && path === '/shop/admin/config') {
    response.writeHead(200).end(JSON.stringify({ enabled: Boolean(d.auth.address), address: d.auth.address })); return;
  }
  if (request.method === 'POST' && (path === '/shop/admin/challenge' || path === '/shop/admin/verify')) {
    const playerId = d.verifyPlayer(request.headers.authorization);
    await sendJson(response, 200, path.endsWith('/challenge') ? d.auth.challenge(playerId) : d.auth.verify(playerId, await d.readBody(request))); return;
  }
  const admin = await d.auth.authenticate(request.headers.authorization);
  if (request.method === 'GET' && path === '/shop/admin/usd-rates') { await sendJson(response, 200, d.service.usdRates()); return; }
  if (request.method === 'DELETE' && path === '/shop/admin/session') { await d.auth.logout(request.headers.authorization); response.writeHead(204).end(); return; }
  if (request.method === 'GET' && path === '/shop/admin/settings') { await sendJson(response, 200, d.service.snapshot()); return; }
  if (request.method === 'PUT' && path === '/shop/admin/prices') { await sendJson(response, 200, d.prices.save(admin, await d.readBody(request))); return; }
  if (request.method === 'PUT' && path === '/shop/admin/pack-settings') { await sendJson(response, 200, d.service.savePack(admin, await d.readBody(request))); return; }
  if (request.method === 'POST' && path === '/shop/admin/publications') { await sendJson(response, 201, d.service.prepare(admin, await d.readBody(request))); return; }
  if (request.method === 'POST' && path === '/shop/admin/pack-price') { await sendJson(response, 201, d.service.prepare(admin, await d.readBody(request), 'price')); return; }
  const publication = /^\/shop\/admin\/publications\/([a-f0-9]{64})(\/submit)?$/.exec(path);
  if (publication && request.method === 'GET' && !publication[2]) { await sendJson(response, 200, d.service.get(admin, publication[1]!)); return; }
  if (publication && request.method === 'POST' && publication[2]) { const body = await d.readBody(request); await sendJson(response, 200, d.service.submit(admin, publication[1]!, body.transaction)); return; }
  response.writeHead(404).end(JSON.stringify({ error: 'Admin endpoint not found' }));
}
