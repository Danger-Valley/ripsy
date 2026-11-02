// Local UI fixture only. No real wallet, RPC, live prices or chain transactions.
// Usage: node scripts/test-shop-admin-browser.mjs --playwright=/absolute/path/to/playwright/index.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv.find(a => a.startsWith('--playwright='))?.slice(13);
const backend = process.argv.includes('--backend');
const figureUploads = process.argv.includes('--figures');
if (!modulePath) throw new Error('Pass an installed Playwright module path. This script never installs dependencies.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const output = mkdtempSync(join(tmpdir(), 'ripsy-admin-ui-'));
const admin = 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh';
const figures = [
  { id: 'fig2', name: 'Seeker fighter', symbol: 'SKR', decimals: 6, mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', price: '1', amount: '1000000', packEligible: false },
  { id: 'bonk', name: 'BONK', symbol: 'BONK', decimals: 5, mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', price: '6900000', amount: '690000000000', packEligible: true },
  { id: 'jup', name: 'Jup', symbol: 'JUP', decimals: 6, mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', price: '99', amount: '99000000', packEligible: true },
  { id: 'ore', name: 'ORE', symbol: 'ORE', decimals: 11, mint: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp', price: '0.25', amount: '25000000000', packEligible: true },
];
for (const f of figures) f.imageUrl = `/figures/${f.id}.png`;
const payment = { mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', symbol: 'SKR', decimals: 6, amount: '1099000000' };
const snapshot = { cluster: 'mainnet-beta', prices: { revision: 1, figures, audit: [{ at: Date.now(), address: admin, revision: 1,
  changes: { fig2: { before: '10000000', after: '20000000', currency: { mint: null, symbol: 'SOL', decimals: 9 } } } }] }, pack: { name: 'Fighter pack', available: true, version: 2, payment, drops: [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }] }, packError: null };
if (backend) {
  payment.amount = '10000000'; snapshot.pack.engine = 'backend'; snapshot.pack.version = 1;
  snapshot.backendPack = { catalog: structuredClone(snapshot.pack), audit: [] };
}
let job = null; let signedCount = 0; let saveCount = 0; let expire = false;
let packSaves = 0;
snapshot.packPriceRevision = '0';
let ratesFailed = false; let rateCalls = 0;
const registered = { revision: 0, usedBytes: 0, draft: null, published: [], currencies: [{ symbol: 'SKR', decimals: 6 }, { symbol: 'SOL', decimals: 9 }], limits: { rive: 8388608, png: 4194304, storage: 67108864, draftSeconds: 1800 } };
const uploadPng = readFileSync('frontend/apps/web/public/figures/alien.png').toString('base64');
let draftCalls = 0, figurePublishes = 0, failUpload = true;
const rateValues = { SOL: 110, BONK: 0.0000033, JUP: 0.36, ORE: 107, SKR: 0.016 };
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
  if (path === '/shop/admin/usd-rates') {
    rateCalls++;
    if (ratesFailed) return send({ error: 'Provider offline' }, 503);
    return send({ source: 'Jupiter', fetchedAt: Date.now(), expiresAt: Date.now() + 60000, error: null,
      rates: Object.fromEntries([...figures, payment].map(f => [f.mint ?? 'So11111111111111111111111111111111111111112', { usdPrice: rateValues[f.symbol], decimals: f.decimals, blockId: 1000 }])) });
  }
  if (path === '/shop/admin/settings') return send(snapshot);
  if (figureUploads && path === '/shop/admin/figures') return send(registered);
  if (figureUploads && path === '/shop/admin/figures/draft' && request.method === 'POST') {
    draftCalls++;
    if (failUpload) return send({ error: 'Rive is incompatible. Export the current fighter contract.' }, 400);
    assert.ok(body.riveBase64.length > 100); assert.equal(body.pngBase64, uploadPng);
    registered.draft = { ...body, createdAt: Date.now(), expiresAt: Date.now() + 1800000, riveBytes: 147526, pngBytes: 100000, riveSha256: 'a'.repeat(64), pngSha256: 'b'.repeat(64), previewDataUrl: `data:image/png;base64,${uploadPng}` };
    // Saved successfully but the response was lost. The UI must recover via GET.
    return send({ error: 'Connection lost after saving. Reload the saved upload.' }, 503);
  }
  if (figureUploads && path === '/shop/admin/figures/draft' && request.method === 'DELETE') { registered.draft = null; return send(registered); }
  if (figureUploads && path === '/shop/admin/figures/publish') {
    figurePublishes++; assert.equal(body.expectedRevision, registered.revision); assert.equal(body.requestId, registered.draft.requestId);
    const d = registered.draft; registered.published.push({ ...d, variant: 9, publishedAt: Date.now(), imageUrl: '/figures/alien.png' });
    registered.draft = null; registered.revision++; registered.usedBytes = 250000;
    figures.push({ id: d.id, name: d.name, symbol: d.currency, decimals: 6, mint: payment.mint, price: d.price, amount: '450000000', packEligible: true, imageUrl: '/figures/alien.png' });
    return send({ error: 'Publication response lost. Reload saved upload to check status.' }, 503);
  }
  if (path === '/shop/admin/pack-settings') {
    assert.equal(backend, true);
    if (body.expectedVersion !== snapshot.backendPack.catalog.version) return send({ error: 'Pack settings changed in another session. Reload before saving.' }, 409);
    assert.equal(body.drops.reduce((sum, d) => sum + d.weight, 0), 1000000);
    const [w, d = ''] = body.price.split('.');
    const catalog = { ...snapshot.pack, version: body.expectedVersion + 1, available: body.available,
      payment: { ...payment, amount: (BigInt(w) * 1000000n + BigInt(d.padEnd(6, '0') || '0')).toString() }, drops: body.drops };
    snapshot.backendPack = { catalog, audit: [{ at: Date.now(), address: admin, before: snapshot.pack, after: catalog }, ...snapshot.backendPack.audit] };
    snapshot.pack = catalog; packSaves++; return send(snapshot.backendPack);
  }
  if (path === '/shop/admin/session') { response.writeHead(204).end(); return; }
  if (path === '/shop/admin/prices') {
    saveCount++; assert.equal(body.revision, snapshot.prices.revision);
    for (const [id, price] of Object.entries(body.prices)) {
      const f = figures.find(f => f.id === id); assert.deepEqual(body.currencies[id], { mint: f.mint, symbol: f.symbol, decimals: f.decimals });
      const [w, d = ''] = price.split('.'); f.price = price; f.amount = (BigInt(w) * 10n ** BigInt(f.decimals) + BigInt(d.padEnd(f.decimals, '0') || '0')).toString();
    }
    snapshot.prices.revision++; return send(snapshot.prices);
  }
  if (path === '/shop/admin/publications' || path === '/shop/admin/pack-price') {
    assert.equal(backend, false, 'Backend packs must never prepare a publication or price transaction');
    const priceOnly = path.endsWith('/pack-price');
    if (priceOnly) { assert.equal(body.expectedRevision, snapshot.packPriceRevision); assert.equal(body.expectedPrice, snapshot.pack.payment.amount); }
    const [w, d = ''] = body.price.split('.');
    job = { id: 'b'.repeat(64), buyer: admin, cluster: 'mainnet-beta', transaction: 'AQ==', edition: '43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ',
      kind: priceOnly ? 'price' : 'edition',
      ...(priceOnly ? { priceUpdate: { account: admin, expectedPrice: body.expectedPrice, expectedRevision: body.expectedRevision, revision: '1' } } : {}),
      catalog: { ...snapshot.pack, version: body.expectedVersion + (priceOnly ? 0 : 1), payment: { ...payment, amount: (BigInt(w) * 1000000n + BigInt(d.padEnd(6, '0') || '0')).toString() }, drops: priceOnly ? snapshot.pack.drops : body.drops },
      status: 'prepared', createdAt: Date.now(), signature: null, lastValidBlockHeight: 100, networkFeeLamports: priceOnly ? '1069880' : '2103040' };
    return send(job);
  }
  if (path.endsWith('/submit')) { signedCount++; job.status = 'submitted'; job.signature = '1'.repeat(64); return send(job); }
  if (path.includes('/publications/')) { job.status = 'confirmed'; snapshot.pack = job.catalog; snapshot.packPriceRevision = job.kind === 'price' ? '1' : '0'; return send(job); }
  send({ error: 'Not found' }, 404);
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const webPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const next = spawn(process.execPath, ['../../../node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(webPort)], {
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
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu'], executablePath: process.argv.find(a => a.startsWith('--chromium='))?.slice(11) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
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
  await page.goto(url); await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.getByRole('button', { name: 'Connect Local test wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in as admin', exact: true }).click();
  await page.getByRole('heading', { name: 'Figure prices', exact: true }).waitFor();
  await page.getByTestId('usd-bonk').filter({ hasText: '$22.77' }).waitFor();
  assert.equal(await page.locator('#price-fig2').inputValue(), '1');
  assert.equal(await page.getByTestId('usd-fig2').textContent(), '≈ $0.02 USD');
  await page.getByText('Seeker fighter: 0.01 → 0.02 SOL', { exact: true }).waitFor();
  await page.locator('#price-fig2').fill('1.0000001');
  assert.equal(await page.getByRole('button', { name: 'Review price changes', exact: true }).isDisabled(), true);
  await page.locator('#price-fig2').fill('1');
  assert.equal(await page.getByTestId('usd-pack').textContent(), backend ? '≈ $0.16 USD' : '≈ $17.58 USD');
  await page.locator('#price-ore').fill('0.3'); assert.equal(await page.getByTestId('usd-ore').textContent(), '≈ $32.10 USD');
  ratesFailed = true; await page.getByRole('button', { name: 'Refresh USD rates', exact: true }).click();
  await page.getByTestId('usd-ore').filter({ hasText: 'USD rate unavailable' }).waitFor();
  assert.equal(await page.locator('#price-ore').inputValue(), '0.3'); assert.equal(saveCount, 0);
  ratesFailed = false; await page.getByRole('button', { name: 'Refresh USD rates', exact: true }).click();
  await page.getByTestId('usd-ore').filter({ hasText: '$32.10' }).waitFor();
  assert.equal(await page.locator('#price-ore').inputValue(), '0.3');
  await page.locator('#price-ore').fill('0.25');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}`);
    await page.screenshot({ path: join(output, `admin-${width}.png`), fullPage: true });
  }
  await page.locator('#price-jup').fill('101.1234567');
  assert.equal(await page.getByRole('button', { name: 'Review price changes', exact: true }).isDisabled(), true);
  await page.locator('#price-jup').fill('100');
  await page.getByRole('button', { name: 'Review price changes', exact: true }).click();
  assert.equal(saveCount, 0); await page.getByRole('button', { name: 'Save live prices', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Figure prices saved' }).waitFor(); assert.equal(saveCount, 1);
  if (backend) {
    assert.equal(await page.getByRole('button', { name: /Sign &|Review & simulate/ }).count(), 0);
    const savePack = page.getByRole('button', { name: 'Save pack settings', exact: true });
    await page.locator('#pack-price').fill('12.5'); await page.locator('#chance-ore').fill('21');
    assert.equal(await savePack.isDisabled(), true);
    await page.locator('#chance-bonk').fill('39'); await savePack.click();
    await page.getByRole('status').filter({ hasText: 'Pack settings saved' }).waitFor();
    assert.equal(snapshot.pack.version, 2); assert.equal(snapshot.pack.payment.amount, '12500000');
    assert.equal(snapshot.pack.drops.find(d => d.figureId === 'ore').weight, 210000);
    assert.equal(packSaves, 1); assert.equal(signedCount, 0); assert.equal(job, null);
    await page.locator('#pack-price').fill('13');
    // A different administrator tab saves first. A reload keeps the dirty local
    // draft and its old revision, so CAS rejects rather than overwriting it.
    snapshot.backendPack.catalog.version++;
    await page.getByRole('button', { name: 'Load current settings', exact: true }).click();
    assert.equal(await page.locator('#pack-price').inputValue(), '13');
    await savePack.click(); await page.getByRole('alert').filter({ hasText: 'changed in another session' }).waitFor();
    assert.equal(packSaves, 1);
    await page.getByRole('region', { name: 'Fighter pack', exact: true }).getByRole('button', { name: 'Reset edits', exact: true }).click();
    assert.equal(await page.locator('#pack-price').inputValue(), '12.5');
    await page.screenshot({ path: join(output, 'admin-backend-saved.png'), fullPage: true });
  } else {
  await page.locator('#pack-price').fill('10'); await page.locator('#chance-ore').fill('invalid');
  await page.getByRole('button', { name: 'Review & simulate price update', exact: true }).click();
  const priceSign = page.getByRole('button', { name: 'Sign & update pack price', exact: true }); await priceSign.waitFor();
  assert.equal(await priceSign.isDisabled(), true); assert.equal(signedCount, 0); assert.equal(job.catalog.version, 2);
  assert.deepEqual(job.catalog.drops, snapshot.pack.drops);
  await page.getByRole('checkbox').check(); await priceSign.click();
  await page.getByRole('heading', { name: 'Price update: submitted', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Check publication status', exact: true }).click();
  await page.getByRole('heading', { name: 'Price update: confirmed', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load current settings', exact: true }).click();
  assert.equal(snapshot.pack.version, 2); assert.equal(snapshot.pack.payment.amount, '10000000');
  await page.locator('#pack-price').fill('1100'); await page.locator('#chance-ore').fill('21');
  assert.equal(await page.getByRole('button', { name: 'Review & simulate next edition', exact: true }).isDisabled(), true);
  await page.locator('#chance-bonk').fill('39'); await page.getByRole('button', { name: 'Review & simulate next edition', exact: true }).click();
  const publish = page.getByRole('button', { name: 'Sign & publish edition 3', exact: true }); await publish.waitFor();
  assert.equal(await publish.isDisabled(), true); assert.equal(signedCount, 1); assert.equal(job.catalog.payment.amount, '10000000');
  await page.getByRole('checkbox').check(); await publish.click();
  await page.getByRole('heading', { name: 'Edition 3: submitted', exact: true }).waitFor(); assert.equal(signedCount, 2);
  assert.equal(await page.locator('#pack-price').isDisabled(), true);
  await page.getByRole('button', { name: 'Check publication status', exact: true }).click();
  await page.getByRole('heading', { name: 'Edition 3: confirmed', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load current settings', exact: true }).click();
  }
  if (figureUploads) {
    const section = page.getByRole('region', { name: 'Add a figure', exact: true });
    await section.getByRole('button', { name: 'Check files & preview', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'new-name');
    assert.equal(draftCalls, 0);
    await page.locator('#new-name').fill('Moon fighter'); await page.locator('#new-id').fill('moon-fighter');
    await page.locator('#new-description').fill('Ready for a new mission.'); await page.locator('#new-price').fill('450');
    await page.locator('#new-rive').setInputFiles('frontend/apps/web/public/figures/alien.riv'); await page.locator('#new-png').setInputFiles('frontend/apps/web/public/figures/alien.png');
    // Re-authentication must retain the browser FileList, not just React state.
    expire = true; await section.getByRole('button', { name: 'Reload saved upload', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in as admin', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#new-name').disabled);
    assert.equal(await page.locator('#new-name').inputValue(), 'Moon fighter');
    assert.equal(await page.locator('#new-rive').evaluate(e => e.files[0]?.name), 'alien.riv');
    assert.equal(await page.locator('#new-png').evaluate(e => e.files[0]?.name), 'alien.png');
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 }); await section.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Upload overflow at ${width}`);
      await section.screenshot({ path: join(output, `figure-editor-${width}.png`) });
    }
    await section.getByRole('button', { name: 'Check files & preview', exact: true }).click();
    await section.getByRole('alert').filter({ hasText: 'Rive is incompatible' }).waitFor();
    assert.equal(await page.locator('#new-name').inputValue(), 'Moon fighter'); assert.equal(await page.locator('#new-png').evaluate(e => e.files.length), 1);
    assert.equal(await section.getByRole('button', { name: 'Check files & preview', exact: true }).isDisabled(), true);
    await section.screenshot({ path: join(output, 'figure-validation-error.png') });
    await section.getByRole('button', { name: 'Reload saved upload', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#new-name').disabled);
    failUpload = false;
    await section.getByRole('button', { name: 'Check files & preview', exact: true }).click();
    await section.getByRole('alert').filter({ hasText: 'Connection lost after saving' }).waitFor();
    assert.equal(figurePublishes, 0); assert.equal(draftCalls, 2);
    await section.getByRole('button', { name: 'Reload saved upload', exact: true }).click();
    const publish = section.getByRole('button', { name: 'Publish figure', exact: true }); await publish.waitFor();
    assert.equal(await publish.isDisabled(), true); assert.equal(figurePublishes, 0);
    await section.getByRole('button', { name: 'Discard preview', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#new-name').disabled);
    assert.equal(await page.locator('#new-rive').evaluate(e => e.files[0]?.name), 'alien.riv');
    assert.equal(await page.locator('#new-png').evaluate(e => e.files[0]?.name), 'alien.png');
    await section.getByRole('button', { name: 'Check files & preview', exact: true }).click();
    await section.getByRole('alert').filter({ hasText: 'Connection lost after saving' }).waitFor();
    await section.getByRole('button', { name: 'Reload saved upload', exact: true }).click(); await publish.waitFor();
    const image = section.getByRole('img', { name: 'Moon fighter uploaded portrait' });
    await image.evaluate(e => e.decode());
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await section.screenshot({ path: join(output, `figure-preview-${width}.png`) });
    }
    await page.locator('#price-jup').fill('101');
    await section.getByRole('checkbox').check(); await publish.click();
    await section.getByRole('alert').filter({ hasText: 'Publication response lost' }).waitFor();
    assert.equal(figurePublishes, 1); assert.equal(await publish.isDisabled(), true);
    await section.getByRole('button', { name: 'Reload saved upload', exact: true }).click();
    await section.getByRole('status').filter({ hasText: 'Moon fighter is published' }).waitFor();
    assert.equal(figurePublishes, 1); assert.equal(await page.locator('#price-jup').inputValue(), '101');
    assert.equal(await page.locator('#price-moon-fighter').inputValue(), '450');
    assert.equal(await page.locator('#chance-moon-fighter').inputValue(), '0');
    await section.screenshot({ path: join(output, 'figure-published.png') });
  }
  await page.locator('#price-jup').fill('102'); expire = true;
  await page.getByRole('button', { name: 'Review price changes', exact: true }).click(); await page.getByRole('button', { name: 'Save live prices', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in as admin', exact: true }).waitFor(); assert.equal(saveCount, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, backendPacks: backend, figureUploads, draftCalls, figurePublishes, packSaves, packTransactions: signedCount, widths: [375, 768, 1280], usdConversion: true, usdRecoveryPreservesDraft: true, rateCalls, exactPriceValidation: true, expiryBlockedSave: true, screenshots: output, realTransactionSent: false }));
} finally {
  await browser?.close(); next.kill('SIGTERM'); api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
}
