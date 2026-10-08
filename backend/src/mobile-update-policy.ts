import type { IncomingMessage, ServerResponse } from 'node:http';
import { disabledUpdatePolicy, parseUpdatePolicy, type UpdatePolicy } from '@rps/core/app-updates';

/** Railway-only configuration. Empty config intentionally cannot lock existing users out. */
export function loadMobileUpdatePolicy(env: Record<string, string | undefined>): UpdatePolicy {
  if (!env.MOBILE_UPDATE_POLICY?.trim()) return disabledUpdatePolicy();
  try { return parseUpdatePolicy(JSON.parse(env.MOBILE_UPDATE_POLICY)); }
  catch { throw new Error('MOBILE_UPDATE_POLICY is invalid. Check APP_UPDATES.md before enabling updates.'); }
}

export function sendMobileUpdatePolicy(request: IncomingMessage, response: ServerResponse, policy: UpdatePolicy): void {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET, OPTIONS');
    response.writeHead(405).end(JSON.stringify({ error: 'Method not allowed' })); return;
  }
  response.writeHead(200).end(JSON.stringify(policy));
}
