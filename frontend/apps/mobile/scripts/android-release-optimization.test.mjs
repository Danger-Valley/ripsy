import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const gradle = read('../android/app/build.gradle');
const buildTypes = gradle.split('buildTypes {')[1].split('\ndependencies {')[0];
const debug = buildTypes.split('debug {')[1].split('\n        release {')[0];
const release = buildTypes.split('\n        release {')[1];

test('release enables both R8 and resource optimization with optimized default rules', () => {
  assert.match(release, /\bminifyEnabled true\b/);
  assert.match(release, /\bshrinkResources true\b/);
  assert.match(release, /getDefaultProguardFile\("proguard-android-optimize.txt"\)/);
  assert.match(release, /"proguard-rules.pro"/);
});

test('debug retains unoptimized development behavior', () => {
  assert.doesNotMatch(debug, /\b(?:minifyEnabled|shrinkResources) true\b/);
});

test('full-mode optimization is not globally disabled or hidden behind blanket keeps', () => {
  assert.doesNotMatch(read('../android/gradle.properties'), /^\s*android.enableR8.fullMode\s*=\s*false\s*$/m);
  const rules = read('../android/app/proguard-rules.pro').split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(rules, /^\s*-(?:dontoptimize|dontshrink|dontobfuscate)\b/m);
  assert.doesNotMatch(rules, /^\s*-keep(?:,[^ ]+)?\s+(?:class|interface)\s+\*\*?\b/m);
});

test('Seeker releases archive matching R8 mappings before publishing', () => {
  const script = read('./build-prod-seeker.sh');
  assert.match(script, /\[\[ ! -s "\$\{source_mapping\}" \]\]/);
  for (const destination of ['destination_apk', 'shared_destination_apk']) {
    const copy = `cp "\${source_mapping}" "\${${destination}%.apk}.mapping.txt"`;
    assert.ok(script.includes(copy));
    assert.ok(script.indexOf(copy) < script.indexOf('node "${script_directory}/publish-seeker-apk.mjs"'));
  }
});

test('Play bundle releases archive mappings with their effective version', () => {
  const script = read('./android-bundle.sh');
  assert.match(script, /\[\[ ! -s "\$\{source_mapping\}" \]\]/);
  assert.match(script, /RIPSY_VERSION_CODE:-/);
  assert.match(script, /RIPSY_VERSION_NAME:-/);
  assert.ok(script.includes('cp "${source_mapping}" "${mapping_directory}/Ripsy-v${version_name}(${version_code})-play.mapping.txt"'));
});
