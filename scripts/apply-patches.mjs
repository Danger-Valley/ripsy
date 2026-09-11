import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let patchPackageEntry;

try {
  patchPackageEntry = require.resolve('patch-package');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  console.log('Skipping patch-package because it is not installed in this workspace.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [patchPackageEntry], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
