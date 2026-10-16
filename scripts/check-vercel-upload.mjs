// Ask the actual Vercel uploader what it will send, before sending anything.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const figures = JSON.parse(readFileSync(new URL('../backend/src/figure-registry.json', import.meta.url), 'utf8'));
const child = spawn('npx', ['--offline', '--yes', 'vercel@62.4.0', 'deploy', '--dry', '--json',
  '--prod', '--scope', 'danger-valley'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', () => { /* CLI diagnostics can include private local context. */ });
child.on('error', () => { console.error('Could not start Vercel dry-run'); process.exitCode = 1; });
child.on('close', code => {
  if (code !== 0) { console.error('Vercel dry-run failed; no upload'); process.exitCode = 1; return; }
  try {
    const data = JSON.parse(output);
    const files = data.files.map(file => file.path);
    const unsafe = files.find(path => /(^|\/)(\.env[^/]*|\.git|\.aws|\.codex|\.railway|keys)(\/|$)/.test(path) ||
      /^(backend|onchain|files|tmp|frontend\/apps\/mobile)(\/|$)/.test(path) ||
      /\.(p8|p12|jks|keystore)$|keypair[^/]*\.json$/i.test(path));
    if (unsafe) throw new Error(`Unsafe deployment path: ${unsafe}`);
    for (const path of ['package.json', 'package-lock.json', 'scripts/apply-patches.mjs',
      'frontend/apps/web/package.json', 'frontend/tsconfig.base.json', 'frontend/packages/core/src/packs.ts',
      'frontend/packages/core/src/figure-manifest.ts',
      'frontend/packages/core/src/shop-admin.ts', 'frontend/apps/web/app/admin/shop/page.tsx',
      'frontend/apps/web/app/admin/shop/shop-admin-content.tsx',
      'frontend/apps/web/app/admin/shop/backend-pack-editor.tsx',
      ...figures.flatMap(({ id, purchasable }) => (purchasable ? ['json', 'png', 'riv'] : ['png', 'riv']).map(ext => `frontend/apps/web/public/figures/${id}.${ext}`))])
      if (!files.includes(path)) throw new Error(`Required web input missing: ${path}`);
    console.log(JSON.stringify({ verified: true, sourceFiles: files.length, sourceBytes: data.totalSize,
      backendAndNativeExcluded: true, secretsExcluded: true }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
