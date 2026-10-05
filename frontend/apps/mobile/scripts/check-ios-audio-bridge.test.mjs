import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkIosAudioBridge } from './check-ios-audio-bridge.mjs';

const module = 'RCT_EXPORT_MODULE(RipsyAudio)\n';
const method = 'RCT_EXPORT_METHOD(prepare:(NSDictionary *)pack resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {}';
test('the actual iOS bridge has a convertible dictionary and validates its values', () => {
  const source = readFileSync(new URL('../ios/RipsyMobile/Audio/RipsyAudioModule.inc', import.meta.url), 'utf8');
  assert.equal(checkIosAudioBridge(source), null);
  assert.match(source, /\[pack isKindOfClass:NSDictionary\.class\]/);
  assert.match(source, /\[encoded isKindOfClass:NSString\.class\]/);
});
test('rejects build 49 typed dictionary signature despite valid Objective-C syntax', () => {
  assert.match(checkIosAudioBridge(module + method.replace('NSDictionary *', 'NSDictionary<NSString *, NSString *> *')), /plain NSDictionary/);
});
test('requires both promise blocks in the correct order', () => {
  assert.match(checkIosAudioBridge(module + method.replace('RCTPromiseRejectBlock', 'RCTPromiseResolveBlock')), /resolve\/reject/);
  assert.match(checkIosAudioBridge(module + method.replace(' rejecter:(RCTPromiseRejectBlock)reject', '')), /resolve\/reject/);
});
test('commented-out or missing declarations cannot satisfy the guard', () => {
  assert.match(checkIosAudioBridge(module + '/* ' + method + ' */'), /exactly one/);
  assert.match(checkIosAudioBridge('// ' + module + method), /Export the/);
});
test('rejects duplicate prepare exports', () => {
  assert.match(checkIosAudioBridge(module + method + method), /exactly one/);
});
test('rejects a wrongly named module', () => {
  assert.match(checkIosAudioBridge(module.replace('RipsyAudio', 'OtherAudio') + method), /RipsyAudio native module/);
});
