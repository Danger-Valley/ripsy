import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'frontend/apps/mobile/src/assets/sounds');
const source = await readFile(path.join(folder, 'sound-data.ts'), 'utf8');
const data = JSON.parse(source.split('export const soundData = ')[1].split(' as const;')[0]);
const expected = ['click', 'select', 'shuffle', 'ready', 'jump', 'land', 'rock', 'paper', 'scissors', 'trap', 'tie', 'victory', 'defeat'];
assert.deepEqual(Object.keys(data), expected);
let total = 0;
for (const name of expected) {
  const wav = await readFile(path.join(folder, `${name}.wav`));
  assert.deepEqual(wav, Buffer.from(data[name], 'base64'), `${name}: native data matches the listenable file`);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 22050); assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), wav.length - 44); assert.ok(wav.length < 100000, `${name}: within native decoded limit`);
  let peak = 0; let energy = 0; let sum = 0;
  for (let offset = 44; offset < wav.length; offset += 2) {
    const sample = wav.readInt16LE(offset) / 32768; peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; sum += sample;
  }
  const count = (wav.length - 44) / 2;
  assert.ok(peak > 0.1 && peak < 0.66, `${name}: audible, no clipping`);
  assert.ok(Math.sqrt(energy / count) > 0.01, `${name}: not silent`);
  assert.ok(Math.abs(sum / count) < 0.025, `${name}: low DC offset`);
  assert.equal(wav.readInt16LE(44), 0); assert.equal(wav.readInt16LE(wav.length - 2), 0);
  total += wav.length;
  console.log(`${name.padEnd(8)} ${(count / 22050).toFixed(2)}s  peak ${peak.toFixed(3)}`);
}
console.log(`All 13 sound files validated; ${(total / 1024).toFixed(1)} KiB PCM.`);
