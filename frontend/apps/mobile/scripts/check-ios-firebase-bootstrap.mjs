import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Source guard, not a substitute for running the native app. Catch the missing
// bootstrap call before a release can pass only because its plist is present.
export function checkIosFirebaseBootstrap(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (!/\bimport\s+Firebase(?:Core)?\b/.test(code)) return 'AppDelegate must import FirebaseCore';
  const start = code.indexOf('didFinishLaunchingWithOptions');
  if (start < 0) return 'AppDelegate is missing didFinishLaunchingWithOptions';
  const nextApplication = code.indexOf('func application', start);
  const startup = code.slice(start, nextApplication < 0 ? undefined : nextApplication);
  const configure = startup.search(/\bFirebaseApp\s*\.\s*configure\s*\(\s*\)/);
  const react = startup.search(/\b(?:ReactNativeDelegate|RCTReactNativeFactory)\s*\(/);
  if (configure < 0) return 'Configure Firebase in didFinishLaunchingWithOptions';
  if (react < 0 || configure > react) return 'Configure Firebase before constructing React Native';
  return null;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (!process.argv[2]) throw new Error('Supply the AppDelegate.swift path');
    const error = checkIosFirebaseBootstrap(readFileSync(process.argv[2], 'utf8'));
    if (error) throw new Error(error);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid iOS Firebase bootstrap');
    process.exitCode = 1;
  }
}
