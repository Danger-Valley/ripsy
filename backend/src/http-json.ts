import type { ServerResponse } from 'node:http';

/** Resolve/serialize before committing headers, so failures remain catchable. */
export async function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(await value);
  response.writeHead(status).end(body);
}

/** App Platform replaces 503 bodies with an HTML 504, losing checkout recovery. */
export async function sendShopErrorJson(response: ServerResponse, status: number, value: unknown, appPlatformJsonErrors = false) {
  if (appPlatformJsonErrors && status === 503) {
    response.setHeader('x-ripsy-error-status', '503');
    status = 409;
  }
  await sendJson(response, status, value);
}
