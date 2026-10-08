import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPackFigureResources } from './pack-metadata.js';

const origin = 'https://www.ripsy.fun';
const figure = { id: 'jup', name: 'Jup' };
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2]);
const metadata = { name: 'Jup', image: `${origin}/figures/jup.png`,
  attributes: [{ trait_type: 'Figure', value: 'jup' }] };
const mock = (json: unknown = metadata, png: Uint8Array = image): typeof fetch =>
  async input => String(input).endsWith('.json') ? Response.json(json) : new Response(png as BodyInit);

test('publication requires matching metadata and exact expected PNG', async () => {
  const result = await verifyPackFigureResources(origin, figure, image, mock());
  assert.equal(result.uri, `${origin}/figures/jup.json`);
});
test('404/HTML and wrong name/image/figure trait cannot be published', async () => {
  await assert.rejects(() => verifyPackFigureResources(origin, figure, image,
    async () => new Response('missing', { status: 404 })));
  for (const json of [null, [], { ...metadata, name: 'BONK' },
    { ...metadata, image: 'https://elsewhere.example/a.png' },
    { ...metadata, attributes: [{ trait_type: 'Figure', value: 'bonk' }] }])
    await assert.rejects(() => verifyPackFigureResources(origin, figure, image, mock(json)));
});
test('mismatched preview and non-PNG cannot be published', async () => {
  await assert.rejects(() => verifyPackFigureResources(origin, figure, image, mock(metadata, Buffer.from('image'))));
  await assert.rejects(() => verifyPackFigureResources(origin, figure, image,
    mock(metadata, Buffer.concat([image, Buffer.from([5])]))));
});
test('invalid origins and oversized streamed metadata fail closed', async () => {
  for (const value of ['http://example.com', 'https://user:secret@example.com', 'https://example.com?secret=foo'])
    await assert.rejects(() => verifyPackFigureResources(value, figure, image, mock()));
  await assert.rejects(() => verifyPackFigureResources(origin, figure, image,
    async () => new Response('x'.repeat(65537))));
});
test('resource exceptions do not expose credentials in operator diagnostics', async () => {
  await assert.rejects(() => verifyPackFigureResources(origin, figure, image,
    async () => { throw new Error('credential-sensitive details'); }),
    { message: 'Published metadata/preview not ready for jup' });
});
