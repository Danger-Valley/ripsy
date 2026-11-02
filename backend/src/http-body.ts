import type { IncomingMessage } from 'node:http';

export class BodyTooLargeError extends Error {
  constructor() { super('Request body is too large'); }
}
/** Small by default; only the authenticated upload route opts into a larger cap. */
export async function readJsonBody(request: IncomingMessage, maxBytes = 4 * 1024): Promise<Record<string, unknown>> {
  if (Number(request.headers['content-length'] ?? 0) > maxBytes) throw new BodyTooLargeError();
  const timer = setTimeout(() => request.destroy(new Error('Request body timed out')), 30000);
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) throw new BodyTooLargeError();
      chunks.push(buffer);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A JSON object is required');
    return value as Record<string, unknown>;
  } finally { clearTimeout(timer); }
}
