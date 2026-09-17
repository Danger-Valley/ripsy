import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The canvas runtime initializes optional browser renderers even though this
// script only reads metadata. A no-op canvas keeps the inspection headless.
globalThis.document = { createElement: () => ({ getContext: () => null }) };

const { RuntimeLoader } = require('@rive-app/canvas');
const wasmBytes = fs.readFileSync(require.resolve('@rive-app/canvas/rive.wasm'));
RuntimeLoader.setWasmBinary(
  wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength),
);
RuntimeLoader.setWasmFallbackUrl(null);

const runtime = await RuntimeLoader.awaitInstance();
const assetPath = path.resolve(process.argv[2] ?? 'frontend/apps/mobile/src/assets/figures/fig1.riv');
const assetBytes = fs.readFileSync(assetPath);
const assetLoader = new runtime.CustomFileAssetLoader({ loadContents: () => true });
const file = await runtime.load(new Uint8Array(assetBytes), assetLoader, false);

for (let artboardIndex = 0; artboardIndex < file.artboardCount(); artboardIndex += 1) {
  const artboard = file.artboardByIndex(artboardIndex);
  console.log(`\n${artboard.name}`);
  console.log('Animation\tFrames\tFPS\tDuration');
  for (let animationIndex = 0; animationIndex < artboard.animationCount(); animationIndex += 1) {
    const animation = artboard.animationByIndex(animationIndex);
    const durationMs = Math.round(animation.duration / animation.fps * 1000);
    console.log(`${animation.name}\t${animation.duration}\t${animation.fps}\t${durationMs} ms`);
  }
  console.log('State machine\tInputs');
  for (let stateMachineIndex = 0; stateMachineIndex < artboard.stateMachineCount(); stateMachineIndex += 1) {
    const stateMachine = artboard.stateMachineByIndex(stateMachineIndex);
    const instance = new runtime.StateMachineInstance(stateMachine, artboard);
    const inputs = [];
    for (let inputIndex = 0; inputIndex < instance.inputCount(); inputIndex += 1) {
      const input = instance.input(inputIndex);
      inputs.push(`${input.name}:${input.type}`);
    }
    console.log(`${stateMachine.name}\t${inputs.join(', ')}`);
    instance.delete();
  }
  artboard.delete();
}

assetLoader.delete?.();
file.delete();
