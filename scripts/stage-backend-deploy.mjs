// Railway gets only Dockerfile inputs, never the working tree or local secrets.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = process.cwd();
const stage = mkdtempSync(join(tmpdir(), 'ripsy-backend-deploy-'));
const files = ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json'];
for (const base of ['backend', 'frontend/packages/core', 'frontend/packages/game-engine']) {
  files.push(`${base}/package.json`, `${base}/tsconfig.json`);
  const walk = relative => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && /\.(ts|json)$/.test(path)) files.push(path);
      else throw new Error(`Unexpected deployment input: ${path}`);
    }
  };
  walk(`${base}/src`);
}
let bytes = 0;
for (const file of files) {
  if (/(^|\/)(\.env[^/]*|keys)(\/|$)|keypair|\.(p8|p12|jks|keystore)$/i.test(file))
    throw new Error(`Unsafe deployment input: ${file}`);
  mkdirSync(dirname(join(stage, file)), { recursive: true });
  copyFileSync(join(root, file), join(stage, file));
  bytes += statSync(join(root, file)).size;
}
console.log(JSON.stringify({ stage, files: files.length, bytes, secretFilesExcluded: true }));
