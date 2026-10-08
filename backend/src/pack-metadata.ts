import { createHash } from 'node:crypto';

/** Do not lock an immutable edition to missing/wrong production metadata. */
export async function verifyPackFigureResources(
  publicOrigin: string,
  figure: { id: string; name: string },
  expectedImage: Uint8Array,
  fetcher: typeof fetch = fetch,
): Promise<{ uri: string; image: string }> {
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash ||
      !/^[a-z0-9-]+$/.test(figure.id)) throw new Error('Invalid public figure origin');
  const uri = `${publicOrigin.replace(/\/$/, '')}/figures/${figure.id}.json`;
  const image = `${publicOrigin.replace(/\/$/, '')}/figures/${figure.id}.png`;
  try {
    const jsonBytes = await readBounded(await fetcher(uri, { signal: AbortSignal.timeout(15000) }), 65536);
    const metadata: unknown = JSON.parse(new TextDecoder().decode(jsonBytes));
    if (!record(metadata) || metadata.name !== figure.name || metadata.image !== image ||
        !Array.isArray(metadata.attributes) || !metadata.attributes.some(
          (a: unknown) => record(a) && a.trait_type === 'Figure' && a.value === figure.id))
      throw new Error('Wrong metadata');
    const actual = await readBounded(await fetcher(image, { signal: AbortSignal.timeout(15000) }), 10_000_000);
    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    if (!Buffer.from(actual.subarray(0, 8)).equals(pngHeader) || sha(actual) !== sha(expectedImage))
      throw new Error('Wrong preview');
    return { uri, image };
  } catch { throw new Error(`Published metadata/preview not ready for ${figure.id}`); }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error('Resource unavailable');
  if (Number(response.headers.get('content-length') ?? 0) > limit) {
    await response.body.cancel();
    throw new Error('Resource too large');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) { await reader.cancel(); throw new Error('Resource too large'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
