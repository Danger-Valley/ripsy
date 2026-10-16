import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mobileDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['splashscreen.png', 'SplashArtwork.imageset/splash-artwork.png'],
];
const gradients = ['yellow', 'blue', 'coral', 'green', 'white', 'panel', 'sky'];

export function checkUiAssets(root = mobileDirectory) {
  const issues = [];
  for (const name of gradients) {
    const file = `home-gradient-${name}.png`;
    const png = readFileSync(resolve(root, 'src/assets/ui', file));
    if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || png.readUInt32BE(16) !== 8 || png.readUInt32BE(20) !== 256) {
      issues.push(`${file} must remain an 8 x 256 color ramp, not illustration artwork`);
    }
  }
  for (const [source, target] of copies) {
    if (!readFileSync(resolve(root, 'src/assets/ui', source)).equals(
      readFileSync(resolve(root, 'ios/RipsyMobile/Images.xcassets', target)),
    )) issues.push(`Native ${target} differs from ${source}; run npm run assets:sync`);
  }
  return issues;
}

export function syncUiAssets(root = mobileDirectory) {
  // Exact file copies only. Never resize or overwrite the user's source artwork.
  for (const [source, target] of copies) {
    copyFileSync(resolve(root, 'src/assets/ui', source), resolve(root, 'ios/RipsyMobile/Images.xcassets', target));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (!process.argv.includes('--check')) syncUiAssets();
    const issues = checkUiAssets();
    if (issues.length) throw new Error(issues.join('\n'));
    console.log('UI artwork copies and gradient dimensions verified');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'UI artwork verification failed');
    process.exitCode = 1;
  }
}
