import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ShopService } from './shop-service.js';

export async function handleShopReconciliation(request: IncomingMessage, response: ServerResponse, pathname: string, dependencies: {
  service: Pick<ShopService, 'reconcile'>;
  verifyPlayer(authorization: string | undefined): string;
  readBody(request: IncomingMessage): Promise<Record<string, unknown>>;
}): Promise<boolean> {
  const match = /^\/shop\/orders\/([a-f0-9]{64})\/reconcile$/.exec(pathname);
  if (!match || request.method !== 'POST') return false;
  const playerId = dependencies.verifyPlayer(request.headers.authorization);
  const result = await dependencies.service.reconcile(playerId, match[1]!, await dependencies.readBody(request));
  response.writeHead(200).end(JSON.stringify(result));
  return true;
}
