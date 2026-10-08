import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const main = resolve(__dirname, '../android/app/src/main');
const read = (file: string) => readFileSync(resolve(main, file), 'utf8');

test('both manifest launcher entries select adaptive resources on Android 26+', () => {
  const manifest = read('AndroidManifest.xml');
  expect(manifest).toContain('android:icon="@mipmap/ic_launcher_adaptive"');
  expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round_adaptive"');
  for (const name of ['ic_launcher_adaptive', 'ic_launcher_round_adaptive']) {
    const xml = read(`res/mipmap-anydpi-v26/${name}.xml`);
    expect(xml).toContain('<adaptive-icon');
    expect(xml).toContain('<background android:drawable="@color/ripsy_launcher_background"');
    expect(xml).toContain('<foreground android:drawable="@drawable/ic_launcher_foreground"');
  }
});

test('full-square art fills the adaptive viewport without a white plate or round raster corners', () => {
  const foreground = read('res/drawable/ic_launcher_foreground.xml');
  const inset = Number(/android:inset="([\d.]+)%"/.exec(foreground)![1]) / 100;
  expect(108 * (1 - 2 * inset)).toBeCloseTo(72, 5);
  expect(foreground).toContain('android:gravity="fill"');
  expect(foreground).toContain('android:src="@mipmap/ic_launcher"');
  expect(read('res/values/colors.xml')).toContain('<color name="ripsy_launcher_background">#1E8EC1</color>');
});

test('legacy launcher fallbacks and launch-screen bitmap still reference PNGs, not adaptive XML', () => {
  const fallbacks = read('res/values/launcher_icons.xml');
  expect(fallbacks).toContain('<item type="mipmap" name="ic_launcher_adaptive">@mipmap/ic_launcher</item>');
  expect(fallbacks).toContain('<item type="mipmap" name="ic_launcher_round_adaptive">@mipmap/ic_launcher_round</item>');
  expect(read('res/drawable/launch_screen.xml')).toContain('android:src="@mipmap/ic_launcher"');
  expect(read('res/values-v31/styles.xml')).toContain('<item name="android:windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>');
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      const bytes = readFileSync(resolve(main, `res/mipmap-${density}/${name}.png`));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  }
});
