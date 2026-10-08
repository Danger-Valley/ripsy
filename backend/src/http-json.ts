import type { ServerResponse } from 'node:http';

/** Resolve/serialize before committing headers, so failures remain catchable. */
export async function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(await value);
  response.writeHead(status).end(body);
}
