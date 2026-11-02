import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-json.js';
import type { FigureAdminService } from './figure-admin.js';
import { ShopError } from './shop-error.js';

/** Called only after the existing exact-wallet admin session authenticates. */
export async function handleFigureAdmin(request: IncomingMessage, response: ServerResponse, path: string, admin: string,
  service: FigureAdminService, readBody: (request: IncomingMessage, maxBytes?: number) => Promise<Record<string, unknown>>) {
  if (path === '/shop/admin/figures' && request.method === 'GET') { await sendJson(response, 200, service.snapshot(admin)); return true; }
  if (path === '/shop/admin/figures/draft' && request.method === 'POST') {
    await sendJson(response, 201, service.prepare(admin, () => readBody(request, 17 * 1024 * 1024))); return true;
  }
  if (path === '/shop/admin/figures/draft' && request.method === 'DELETE') {
    const body = await readBody(request); await sendJson(response, 200, service.discard(admin, body.requestId)); return true;
  }
  if (path === '/shop/admin/figures/publish' && request.method === 'POST') {
    await sendJson(response, 200, service.publish(admin, await readBody(request))); return true;
  }
  return false;
}
export async function serveFigureResource(request: IncomingMessage, response: ServerResponse, path: string, service: FigureAdminService) {
  if (!path.startsWith('/shop/figure-assets/')) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new ShopError('Figure resource method not allowed.', 405);
  const value = await service.resource(path.slice('/shop/figure-assets/'.length));
  response.setHeader('cache-control', 'public,max-age=31536000,immutable');
  response.setHeader('content-type', value.type); response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('etag', `"${value.hash}"`);
  if (request.headers['if-none-match'] === `"${value.hash}"`) { response.writeHead(304).end(); return true; }
  response.setHeader('content-length', value.bytes.length);
  response.writeHead(200).end(request.method === 'HEAD' ? undefined : value.bytes); return true;
}
