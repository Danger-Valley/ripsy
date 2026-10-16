import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkUiAssets, syncUiAssets } from './sync-ui-assets.mjs';

function fixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), 'ripsy-ui-assets-test-'));
  const put = (path, bytes) => {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  };
  const ramp = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(ramp);
  ramp.writeUInt32BE(8, 16);
  ramp.writeUInt32BE(256, 20);
  for (const name of ['yellow', 'blue', 'coral', 'green', 'white', 'panel', 'sky']) put(`src/assets/ui/home-gradient-${name}.png`, ramp);
  for (const [source, target] of [
    ['splashscreen.png', 'SplashArtwork.imageset/splash-artwork.png'],
  ]) {
    put(`src/assets/ui/${source}`, Buffer.from(source));
    put(`ios/RipsyMobile/Images.xcassets/${target}`, Buffer.from(source));
  }
  try { run(root, put); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('accepts synchronized native copies and small color ramps', () => fixture(root => {
  assert.deepEqual(checkUiAssets(root), []);
}));

test('detects and synchronizes replaced splash artwork without modifying the source', () => fixture((root, put) => {
  const replacement = Buffer.from('user replacement PNG');
  put('src/assets/ui/splashscreen.png', replacement);
  assert.match(checkUiAssets(root)[0], /SplashArtwork.*differs/);
  syncUiAssets(root);
  assert.deepEqual(checkUiAssets(root), []);
  assert.deepEqual(readFileSync(resolve(root, 'src/assets/ui/splashscreen.png')), replacement);
  assert.deepEqual(readFileSync(resolve(root, 'ios/RipsyMobile/Images.xcassets/SplashArtwork.imageset/splash-artwork.png')), replacement);
}));

test('rejects illustration-sized artwork accidentally used as the sky ramp', () => fixture((root, put) => {
  const invalid = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(invalid);
  invalid.writeUInt32BE(1983, 16);
  invalid.writeUInt32BE(793, 20);
  put('src/assets/ui/home-gradient-sky.png', invalid);
  assert.match(checkUiAssets(root)[0], /home-gradient-sky.*8 x 256/);
}));

test('rejects invalid color-ramp files', () => fixture((root, put) => {
  put('src/assets/ui/home-gradient-sky.png', Buffer.from('not a PNG'));
  assert.match(checkUiAssets(root)[0], /home-gradient-sky/);
}));
