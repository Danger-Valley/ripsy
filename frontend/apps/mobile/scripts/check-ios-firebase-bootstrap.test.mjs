import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkIosFirebaseBootstrap } from './check-ios-firebase-bootstrap.mjs';

const before = 'import FirebaseCore\nfunc application(_ application: UIApplication, didFinishLaunchingWithOptions options: Any?) -> Bool {\n';
const react = 'let delegate = ReactNativeDelegate()\nreturn true\n}\n';
test('actual native app configures Firebase before constructing React', () => {
  const source = readFileSync(new URL('../ios/RipsyMobile/AppDelegate.swift', import.meta.url), 'utf8');
  assert.equal(checkIosFirebaseBootstrap(source), null);
  assert.match(source, /FirebaseApp\.app\(\) == nil/);
  assert.match(source, /Bundle\.main\.path\(forResource: "GoogleService-Info", ofType: "plist"\)/);
});
test('rejects the old plist-only native bootstrap', () => {
  assert.match(checkIosFirebaseBootstrap(before + react), /Configure Firebase in/);
});
test('rejects Firebase configured after React starts', () => {
  assert.match(checkIosFirebaseBootstrap(before + 'let delegate = ReactNativeDelegate()\nFirebaseApp.configure()\n}'), /before constructing/);
});
test('comments cannot satisfy the initialization guard', () => {
  assert.match(checkIosFirebaseBootstrap(before + '// FirebaseApp.configure()\n/* FirebaseApp.configure() */\n' + react), /Configure Firebase in/);
});
test('a call in a different lifecycle method cannot satisfy startup', () => {
  assert.match(checkIosFirebaseBootstrap(before + react + 'func application(_ app: Any, open url: URL) { FirebaseApp.configure() }'), /Configure Firebase in/);
});
test('requires the native Firebase import', () => {
  assert.match(checkIosFirebaseBootstrap((before + 'FirebaseApp.configure()\n' + react).replace('import FirebaseCore', 'import React')), /must import/);
});
