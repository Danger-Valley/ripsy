import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const { RuntimeLoader } = require('@rive-app/canvas');
const bytes = fs.readFileSync(require.resolve('@rive-app/canvas/rive.wasm'));
RuntimeLoader.setWasmBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
RuntimeLoader.setWasmFallbackUrl(null);
const runtime = await RuntimeLoader.awaitInstance();
let baseline;
const registry = JSON.parse(fs.readFileSync('backend/src/figure-registry.json', 'utf8'));
for (const { id, animation, portrait } of registry) {
  const native = fs.readFileSync(`frontend/apps/web/public/figures/${id}.riv`);
  assert.equal(native.length, animation.bytes, `${id} published length`);
  assert.equal(createHash('sha256').update(native).digest('hex'), animation.sha256, `${id} published digest`);
  const png = fs.readFileSync(`frontend/apps/web/public/figures/${id}.png`);
  assert.ok(portrait, `${id} needs a verified PNG descriptor`);
  assert.equal(png.length, portrait.bytes, `${id} PNG length`);
  assert.equal(createHash('sha256').update(png).digest('hex'), portrait.sha256, `${id} PNG digest`);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${id} PNG signature`);
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(16) <= 2048 && png.readUInt32BE(20) > 0 && png.readUInt32BE(20) <= 2048, `${id} PNG bounds`);
  const bundled = `frontend/apps/mobile/src/assets/figures/${id}.riv`;
  if (fs.existsSync(bundled)) {
    assert.deepEqual(native, fs.readFileSync(bundled), `${id} native/web Rive bytes`);
    assert.deepEqual(fs.readFileSync(`frontend/apps/mobile/src/assets/shop/${id}.png`), fs.readFileSync(`frontend/apps/web/public/figures/${id}.png`), `${id} previews`);
  }
  const loader = new runtime.CustomFileAssetLoader({ loadContents: () => true });
  const file = await runtime.load(new Uint8Array(native), loader, false);
  assert.equal(file.artboardCount(), 1);
  const board = file.defaultArtboard();
  const timings = [];
  for (let i = 0; i < board.animationCount(); i++) {
    const animation = board.animationByIndex(i);
    timings.push([animation.name, animation.duration, animation.fps]);
  }
  const machines = [];
  for (let i = 0; i < board.stateMachineCount(); i++) {
    const machine = board.stateMachineByIndex(i);
    const instance = new runtime.StateMachineInstance(machine, board);
    const inputs = [];
    for (let j = 0; j < instance.inputCount(); j++) inputs.push([instance.input(j).name, instance.input(j).type]);
    machines.push([machine.name, inputs]);
    instance.delete();
  }
  const contract = { bounds: board.bounds, timings, machines };
  assert.deepEqual(board.bounds, { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, `${id} drawing geometry`);
  if (baseline) assert.deepEqual(contract, baseline, `${id} must preserve authored timing/state contracts`);
  else baseline = contract;
  board.delete(); file.delete(); loader.delete?.();
  console.log(`${id}: verified digest, geometry, timelines and inputs`);
}
