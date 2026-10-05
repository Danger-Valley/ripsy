import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Source guard for the actual native declaration, not the Jest module mock.
// The installed RN parser rewrites typed NSString dictionaries to an absent
// NSStringDictionary converter. This can compile but fail at the JS call.
export function checkIosAudioBridge(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (!/\bRCT_EXPORT_MODULE\s*\(\s*RipsyAudio\s*\)/.test(code)) return 'Export the RipsyAudio native module';
  const declarations = [...code.matchAll(/RCT_EXPORT_METHOD\s*\(\s*(prepare\s*:[\s\S]*?)\)\s*\{/g)];
  if (declarations.length !== 1) return 'Export exactly one RipsyAudio.prepare method';
  if (!/^prepare\s*:\s*\(\s*NSDictionary\s*\*\s*\)\s*pack\s+resolver\s*:\s*\(\s*RCTPromiseResolveBlock\s*\)\s*resolve\s+rejecter\s*:\s*\(\s*RCTPromiseRejectBlock\s*\)\s*reject\s*$/.test(declarations[0][1])) {
    return 'RipsyAudio.prepare must export plain NSDictionary * followed by resolve/reject promise blocks; typed dictionaries have no React Native converter';
  }
  return null;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (!process.argv[2]) throw new Error('Supply the RipsyAudioModule.inc path');
    const error = checkIosAudioBridge(readFileSync(process.argv[2], 'utf8'));
    if (error) throw new Error(error);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid iOS audio bridge');
    process.exitCode = 1;
  }
}
