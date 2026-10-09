// Local UI fixture only. No real wallet, RPC, live prices or chain transactions.
// Usage: node scripts/test-shop-admin-browser.mjs --playwright=/absolute/path/to/playwright/index.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv.find(a => a.startsWith('--playwright='))?.slice(13);
if (!modulePath) throw new Error('Pass an installed Playwright module path. This script never installs dependencies.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const output = mkdtempSync(join(tmpdir(), 'ripsy-admin-ui-'));
const admin = 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh';
const figures = [
  { id: 'fig2', name: 'Seeker fighter', symbol: 'SOL', decimals: 9, mint: null, price: '0.01', amount: '10000000', packEligible: false },
  { id: 'bonk', name: 'BONK', symbol: 'BONK', decimals: 5, mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', price: '6900000', amount: '690000000000', packEligible: true },
  { id: 'jup', name: 'Jup', symbol: 'JUP', decimals: 6, mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', price: '99', amount: '99000000', packEligible: true },
  { id: 'ore', name: 'ORE', symbol: 'ORE', decimals: 11, mint: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp', price: '0.25', amount: '25000000000', packEligible: true },
];
const payment = { mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', symbol: 'SKR', decimals: 6, amount: '1099000000' };
const snapshot = { cluster: 'mainnet-beta', prices: { revision: 0, figures, audit: [] }, pack: { name: 'Fighter pack', available: true, version: 2, payment, drops: [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }] }, packError: null };
let job = null; let signedCount = 0; let saveCount = 0; let expire = false;
const api = createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
  response.setHeader('access-control-allow-headers', 'authorization,content-type');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  let raw = ''; for await (const chunk of request) raw += chunk; const body = raw ? JSON.parse(raw) : null;
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('content-type', 'application/json');
  const send = (value, status = 200) => response.writeHead(status).end(JSON.stringify(value));
  if (path === '/session') return send({ token: 'fixture-player', playerId: 'fixture-player', expiresAt: new Date(Date.now() + 86400000).toISOString() });
  if (path === '/shop/admin/config') return send({ enabled: true, address: admin });
  if (path === '/shop/admin/challenge') return send({ nonce: 'a'.repeat(32), domain: 'localhost', uri: 'http://localhost', statement: 'Local test only', version: '1', chainId: 'solana:mainnet', issuedAt: new Date().toISOString(), expirationTime: new Date(Date.now() + 300000).toISOString() });
  if (path === '/shop/admin/verify') { expire = false; return send({ token: 'fixture-admin', address: admin, expiresAt: Date.now() + 1800000 }); }
  if (request.headers.authorization !== 'Bearer fixture-admin' || expire) return send({ error: 'Admin session expired. Sign in again.' }, 401);
  if (path === '/shop/admin/settings') return send(snapshot);
  if (path === '/shop/admin/session') { response.writeHead(204).end(); return; }
  if (path === '/shop/admin/prices') {
    saveCount++; assert.equal(body.revision, snapshot.prices.revision);
    for (const [id, price] of Object.entries(body.prices)) {
      const f = figures.find(f => f.id === id); const [w, d = ''] = price.split('.'); f.price = price; f.amount = (BigInt(w) * 10n ** BigInt(f.decimals) + BigInt(d.padEnd(f.decimals, '0') || '0')).toString();
    }
    snapshot.prices.revision++; return send(snapshot.prices);
  }
  if (path === '/shop/admin/publications') {
    const [w, d = ''] = body.price.split('.');
    job = { id: 'b'.repeat(64), buyer: admin, cluster: 'mainnet-beta', transaction: 'AQ==', edition: '43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ',
      catalog: { ...snapshot.pack, version: body.expectedVersion + 1, payment: { ...payment, amount: (BigInt(w) * 1000000n + BigInt(d.padEnd(6, '0') || '0')).toString() }, drops: body.drops },
      status: 'prepared', createdAt: Date.now(), signature: null, lastValidBlockHeight: 100, networkFeeLamports: '46299040' };
    return send(job);
  }
  if (path.endsWith('/submit')) { signedCount++; job.status = 'submitted'; job.signature = '1'.repeat(64); return send(job); }
  if (path.includes('/publications/')) { job.status = 'confirmed'; snapshot.pack = job.catalog; return send(job); }
  send({ error: 'Not found' }, 404);
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const webPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const next = spawn(process.execPath, ['../../../node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)], {
  cwd: join(process.cwd(), 'frontend/apps/web'), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NEXT_PUBLIC_SHOP_API_URL: apiOrigin, NEXT_PUBLIC_GAME_HTTP_URL: `${apiOrigin}/session`, NEXT_PUBLIC_GAME_WS_URL: apiOrigin.replace('http:', 'ws:') },
});
let nextOutput = ''; next.stdout.on('data', b => { nextOutput += b; }); next.stderr.on('data', b => { nextOutput += b; });
let browser;
try {
  const url = `http://127.0.0.1:${webPort}/admin/shop`;
  for (let i = 0; ; i++) {
    if (next.exitCode !== null) throw new Error(`Local Next exited: ${nextOutput.slice(-1000)}`);
    try { const r = await fetch(url); if (r.ok) break; } catch {}
    if (i > 60) throw new Error('Local web fixture did not start.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  // Install a test-only Wallet Standard provider in this isolated browser context.
  // Nothing from this fixture is included in application source or release bundles.
  await context.addInitScript(({ admin }) => {
    const account = { address: admin, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signMessage', 'solana:signTransaction'] };
    let connected = [];
    const wallet = { version: '1.0.0', name: 'Local test wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], get accounts() { return connected; },
      features: {
        'standard:connect': { version: '1.0.0', async connect() { connected = [account]; return { accounts: connected }; } },
        'standard:disconnect': { version: '1.0.0', async disconnect() { connected = []; } },
        'standard:events': { version: '1.0.0', on() { return () => {}; } },
        'solana:signMessage': { version: '1.0.0', async signMessage(...inputs) { return inputs.map(i => ({ account, signedMessage: i.message, signature: new Uint8Array(64) })); } },
        'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: [0], async signTransaction(...inputs) { return inputs.map(i => ({ signedTransaction: i.transaction })); } },
      },
    };
    const register = api => api.register(wallet);
    window.addEventListener('wallet-standard:app-ready', event => register(event.detail));
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
  }, { admin });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.getByRole('button', { name: 'Connect Local test wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in as admin', exact: true }).click();
  await page.getByRole('heading', { name: 'Figure prices', exact: true }).waitFor();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}`);
    await page.screenshot({ path: join(output, `admin-${width}.png`), fullPage: true });
  }
  await page.locator('#price-jup').fill('101.1234567');
  assert.equal(await page.getByRole('button', { name: 'Review price changes', exact: true }).isDisabled(), true);
  await page.locator('#price-jup').fill('100');
  await page.getByRole('button', { name: 'Review price changes', exact: true }).click();
  assert.equal(saveCount, 0); await page.getByRole('button', { name: 'Save live prices', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Figure prices saved' }).waitFor(); assert.equal(saveCount, 1);
  await page.locator('#pack-price').fill('1100'); await page.locator('#chance-ore').fill('21');
  assert.equal(await page.getByRole('button', { name: 'Review & simulate next edition', exact: true }).isDisabled(), true);
  await page.locator('#chance-ore').fill('20'); await page.getByRole('button', { name: 'Review & simulate next edition', exact: true }).click();
  const publish = page.getByRole('button', { name: 'Sign & publish edition 3', exact: true }); await publish.waitFor();
  assert.equal(await publish.isDisabled(), true); assert.equal(signedCount, 0);
  await page.getByRole('checkbox').check(); await publish.click();
  await page.getByRole('heading', { name: 'Edition 3: submitted', exact: true }).waitFor(); assert.equal(signedCount, 1);
  assert.equal(await page.locator('#pack-price').isDisabled(), true);
  await page.getByRole('button', { name: 'Check publication status', exact: true }).click();
  await page.getByRole('heading', { name: 'Edition 3: confirmed', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load current settings', exact: true }).click();
  await page.locator('#price-jup').fill('102'); expire = true;
  await page.getByRole('button', { name: 'Review price changes', exact: true }).click(); await page.getByRole('button', { name: 'Save live prices', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in as admin', exact: true }).waitFor(); assert.equal(saveCount, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, widths: [375, 768, 1280], exactPriceValidation: true, explicitReviewAndSignature: true, expiryBlockedSave: true, screenshots: output, realTransactionSent: false }));
} finally {
  await browser?.close(); next.kill('SIGTERM'); api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
}
