import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { ShopError } from './shop-error.js';
import { FIGURE_UPLOAD_LIMITS } from '@rps/core/admin-figures';

const expected = JSON.parse(readFileSync(new URL('./figure-animation-contract.json', import.meta.url), 'utf8'));
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0;
});
function crc32(data: Buffer) { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 255]! ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }
export function decodeFigureUpload(value: unknown, kind: 'rive' | 'png') {
  const limit = FIGURE_UPLOAD_LIMITS[kind];
  if (typeof value !== 'string' || !value.length || value.length > 4 * Math.ceil(limit / 3)) throw new ShopError(`${kind === 'rive' ? 'Rive' : 'PNG'} file is missing or too large.`);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 8 || bytes.length > limit || bytes.toString('base64') !== value) throw new ShopError(`Upload a valid ${kind === 'rive' ? 'Rive' : 'PNG'} file.`);
  return bytes;
}
export function validateFigurePng(data: Buffer) {
  const fail = () => { throw new ShopError('PNG must be a valid static 8-bit RGB/RGBA image, at most 2048 × 2048 and 4 MiB.'); };
  if (data.length > FIGURE_UPLOAD_LIMITS.png || !data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail();
  let width = 0, height = 0, channels = 0, end = false, chunks = 0;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < data.length;) {
    if (++chunks > 1024 || offset + 12 > data.length) fail();
    const length = data.readUInt32BE(offset), next = offset + length + 12;
    if (next > data.length) fail();
    const type = data.toString('ascii', offset + 4, offset + 8), body = data.subarray(offset + 8, next - 4);
    if (crc32(data.subarray(offset + 4, next - 4)) !== data.readUInt32BE(next - 4)) fail();
    if (chunks === 1 && type !== 'IHDR') fail();
    if (type === 'IHDR') {
      if (chunks !== 1 || length !== 13) fail();
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      if (!width || !height || width > 2048 || height > 2048 || body[8] !== 8 || ![2, 6].includes(body[9]!) || body[10] || body[11] || body[12]) fail();
      channels = body[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') compressed.push(body);
    else if (type === 'IEND') { if (length !== 0 || next !== data.length) fail(); end = true; }
    else if (['acTL', 'fcTL', 'fdAT'].includes(type) || /^[A-Z]/.test(type) && type !== 'PLTE') fail();
    offset = next;
  }
  if (!end || !compressed.length) fail();
  const stride = width * channels + 1, expectedBytes = stride * height;
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes }); } catch { return fail(); }
  if (raw.length !== expectedBytes) fail();
  for (let y = 0; y < height; y++) if (raw[y * stride]! > 4) fail();
}

// Untrusted binary parsing is isolated from the HTTP/game process. No inherited
// secrets, no external asset fetches, bounded input/output, heap and wall time.
const validatorSource = String.raw`
global.document = { createElement: () => ({ getContext: () => null }) };
console.warn = console.log = console.info = console.debug = () => {};
const fs = require('node:fs'), { RuntimeLoader } = require('@rive-app/canvas');
const chunks = []; let size = 0;
process.stdin.on('data', chunk => { size += chunk.length; if(size > 8388608) process.exit(2); chunks.push(chunk); });
process.stdin.on('end', async () => {
 try {
  const wasm = fs.readFileSync(require.resolve('@rive-app/canvas/rive.wasm'));
  RuntimeLoader.setWasmBinary(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  RuntimeLoader.setWasmFallbackUrl(null);
  const runtime = await RuntimeLoader.awaitInstance();
  let missingAsset = false;
  const loader = new runtime.CustomFileAssetLoader({ loadContents: (_asset, bytes) => { if(!bytes || !bytes.length) missingAsset = true; return true; } });
  const file = await runtime.load(new Uint8Array(Buffer.concat(chunks)), loader, false);
  if(!file || missingAsset || file.artboardCount() !== 1) process.exit(2);
  const board = file.defaultArtboard(), timings = [], machines = [];
  if(board.animationCount() > 64 || board.stateMachineCount() > 8) process.exit(2);
  for(let i=0;i<board.animationCount();i++) { const a=board.animationByIndex(i); timings.push([a.name,a.duration,a.fps]); }
  for(let i=0;i<board.stateMachineCount();i++) {
   const m=board.stateMachineByIndex(i), instance=new runtime.StateMachineInstance(m,board), inputs=[];
   if(instance.inputCount()>32) process.exit(2);
   for(let n=0;n<instance.inputCount();n++) inputs.push([instance.input(n).name,instance.input(n).type]);
   machines.push([m.name,inputs]); instance.delete();
  }
  process.stdout.write(JSON.stringify({bounds:board.bounds,timings,machines}));
  process.exit(0);
 } catch { process.exit(2); }
});`;
export async function validateFigureRive(bytes: Buffer): Promise<void> {
  if (bytes.length > FIGURE_UPLOAD_LIMITS.rive) throw new ShopError('Rive file exceeds 8 MiB.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=96', '--input-type=commonjs', '-e', validatorSource], {
      cwd: new URL('../..', import.meta.url), env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '', done = false;
    const finish = (valid: boolean) => {
      if (done) return; done = true; clearTimeout(timer); child.kill();
      valid ? resolve() : reject(new ShopError('Rive is incompatible. Export the existing contract-1 Front/Back machines, inputs, 1000 × 1000 artboard and authored action timings.'));
    };
    const timer = setTimeout(() => finish(false), 5000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 32768) finish(false); });
    child.stderr.on('data', () => undefined);
    child.on('error', () => finish(false)); child.stdin.on('error', () => finish(false));
    child.on('close', code => {
      try { finish(code === 0 && JSON.stringify(JSON.parse(output)) === JSON.stringify(expected)); } catch { finish(false); }
    });
    child.stdin.end(bytes);
  });
}
