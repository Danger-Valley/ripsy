import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Code-generated color ramps for native Image stretching: no added native module.
const ramps = {
  yellow: ['#FFC900', '#FFA400'],
  blue: ['#16D5F7', '#02B6E0'],
  coral: ['#FF656A', '#FF424E'],
  green: ['#22DE68', '#0FC84E'],
  white: ['#F5FAF8', '#E9F1EF'],
  panel: ['#FFFFFF', '#EAF2EF'],
  sky: ['#48D1F0', '#D5EDCE'],
};
for (const [name, [top, bottom]] of Object.entries(ramps)) {
  const start = [1, 3, 5].map(index => parseInt(top.slice(index, index + 2), 16));
  const end = [1, 3, 5].map(index => parseInt(bottom.slice(index, index + 2), 16));
  const pixels = Buffer.alloc(8 * 256 * 3);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 8; x++) {
      for (let channel = 0; channel < 3; channel++) {
        pixels[(y * 8 + x) * 3 + channel] = Math.round(start[channel] + (end[channel] - start[channel]) * y / 255);
      }
    }
  }
  const target = fileURLToPath(new URL(`../frontend/apps/mobile/src/assets/ui/home-gradient-${name}.png`, import.meta.url));
  await sharp(pixels, { raw: { width: 8, height: 256, channels: 3 } }).png().toFile(target);
}
console.log('Generated seven seamless home color ramps.');
