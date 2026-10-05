// Original RIPSY Toy Box effects. Deterministic procedural synthesis only:
// no recordings, sample libraries, remote services or licensed melodies.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'frontend/apps/mobile/src/assets/sounds');
const preview = path.join(root, 'files/sounds');
const rate = 22050;
let seed = 0x52495053;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 * 2 - 1; };
const clip = seconds => new Float64Array(Math.ceil(seconds * rate));
function tone(samples, start, duration, f0, f1 = f0, gain = 0.3, shape = 'bell') {
  let phase = 0;
  const offset = Math.round(start * rate);
  const length = Math.round(duration * rate);
  for (let i = 0; i < length && offset + i < samples.length; i++) {
    const x = i / length;
    phase += 2 * Math.PI * (f0 + (f1 - f0) * x) / rate;
    const envelope = Math.min(1, i / (rate * 0.004)) * Math.pow(1 - x, shape === 'bell' ? 2.8 : 1.5);
    const wave = Math.sin(phase) + (shape === 'bell' ? 0.2 * Math.sin(phase * 2.76) : 0.12 * Math.sin(phase * 2));
    samples[offset + i] += wave * envelope * gain;
  }
}
function noise(samples, start, duration, gain = 0.2) {
  let low = 0;
  const offset = Math.round(start * rate);
  const length = Math.round(duration * rate);
  for (let i = 0; i < length && offset + i < samples.length; i++) {
    low = low * 0.74 + random() * 0.26;
    samples[offset + i] += low * Math.sin(Math.PI * i / length) ** 2 * gain;
  }
}
function wav(samples) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 2, 40);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0.65 ? 0.65 / peak : 1;
  samples.forEach((value, index) => {
    // Short end fade prevents clicks, including in the concatenated preview.
    const tail = Math.min(1, (samples.length - 1 - index) / (rate * 0.008));
    bytes.writeInt16LE(Math.round(value * scale * tail * 32767), 44 + index * 2);
  });
  return bytes;
}
const effects = {};
effects.click = clip(0.09); tone(effects.click, 0, 0.07, 700, 500, 0.25, 'soft');
effects.select = clip(0.13); tone(effects.select, 0, 0.11, 1000, 1300, 0.22);
effects.shuffle = clip(0.32);
for (let n = 0; n < 5; n++) { tone(effects.shuffle, n * 0.045, 0.08, 380 + n * 90, 220 + n * 70, 0.17, 'soft'); }
effects.ready = clip(0.48);
[660, 880, 1100].forEach((f, n) => tone(effects.ready, n * 0.085, 0.3, f, f, 0.21));
effects.jump = clip(0.22); tone(effects.jump, 0, 0.21, 240, 920, 0.32, 'soft'); noise(effects.jump, 0.02, 0.13, 0.12);
effects.land = clip(0.13); tone(effects.land, 0, 0.11, 190, 70, 0.31, 'soft'); tone(effects.land, 0.025, 0.07, 640, 480, 0.12);
effects.rock = clip(0.48); noise(effects.rock, 0, 0.14, 0.26); tone(effects.rock, 0.15, 0.26, 160, 60, 0.46, 'soft'); noise(effects.rock, 0.15, 0.09, 0.42);
effects.paper = clip(0.55);
[0, 0.10, 0.23].forEach(t => { noise(effects.paper, t, 0.12, 0.3); tone(effects.paper, t, 0.12, 620, 360, 0.14, 'soft'); });
tone(effects.paper, 0.27, 0.25, 1046, 1046, 0.18);
effects.scissors = clip(0.97);
[0.12, 0.40, 0.70].forEach(t => { noise(effects.scissors, t, 0.045, 0.26); tone(effects.scissors, t, 0.09, 1850, 950, 0.23, 'soft'); });
effects.trap = clip(0.79); tone(effects.trap, 0, 0.10, 1400, 400, 0.25, 'soft'); noise(effects.trap, 0, 0.06, 0.22);
tone(effects.trap, 0.10, 0.54, 780, 85, 0.29, 'soft'); tone(effects.trap, 0.65, 0.12, 170, 60, 0.35, 'soft');
effects.tie = clip(0.38); tone(effects.tie, 0, 0.26, 740, 740, 0.25); tone(effects.tie, 0.11, 0.26, 740, 740, 0.22);
effects.victory = clip(1.75);
[523.25, 659.25, 783.99, 1046.5].forEach((f, n) => tone(effects.victory, n * 0.13, 0.5, f, f, 0.23));
[523.25, 659.25, 783.99].forEach(f => tone(effects.victory, 0.58, 1.1, f, f, 0.14));
[1568, 2093, 2637, 2093, 3136].forEach((f, n) => tone(effects.victory, 0.75 + n * 0.15, 0.22, f, f, 0.09));
effects.defeat = clip(0.9);
[440, 370, 293, 220].forEach((f, n) => tone(effects.defeat, n * 0.14, 0.33, f, f * 0.94, 0.21, 'soft'));

await mkdir(output, { recursive: true }); await mkdir(preview, { recursive: true });
const data = {};
for (const [name, samples] of Object.entries(effects)) {
  const encoded = wav(samples);
  await writeFile(path.join(output, `${name}.wav`), encoded);
  data[name] = encoded.toString('base64');
}
// Embed short PCM data so native preloading is offline even in a Metro debug
// build. No network fetch/file URI assumptions and no Xcode resource changes.
await writeFile(path.join(output, 'sound-data.ts'), `// Generated by scripts/create-game-sounds.mjs. Do not edit.\nexport const soundData = ${JSON.stringify(data, null, 2)} as const;\n`);
const gap = clip(0.3);
const reel = [effects.click, gap, effects.select, gap, effects.shuffle, gap, effects.ready, gap,
  effects.jump, effects.land, gap, effects.rock, gap, effects.paper, gap, effects.scissors, gap,
  effects.trap, gap, effects.tie, gap, effects.victory, gap, effects.defeat];
const demo = new Float64Array(reel.reduce((n, samples) => n + samples.length, 0));
let cursor = 0;
for (const samples of reel) { demo.set(samples, cursor); cursor += samples.length; }
await writeFile(path.join(preview, 'ripsy-toy-box-demo.wav'), wav(demo));
console.log(`Created ${Object.keys(effects).length} original PCM effects and ${(demo.length / rate).toFixed(2)}s preview.`);
