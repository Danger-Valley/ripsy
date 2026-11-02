import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import type { FirebaseCommerce } from './firebase-commerce.js';
import { commercePayload } from './firebase-commerce.js';
import { BUILTIN_FIGURES, registeredFigureUrls } from './figure-registry.js';
import type { ShopConfig } from './shop-config.js';
import { canonicalCommerce } from './commerce-persistence.js';

export interface MigrationRedis {
  get(key: string): Promise<string | null>;
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string[]>;
  zRangeWithScores(key: string, start: number, end: number): Promise<{ value: string; score: number }[]>;
}
const hash = (value: unknown) => createHash('sha256').update(canonicalCommerce(value)).digest('hex');
type Record_ = { path: string; payload: Record<string, any>; pendingAt?: number | null };
type Archive = { files: { figureId: string; kind: string; sourceUrl: string; filename: string; sha256: string; bytes: number }[]; assets: Map<string, Buffer> };

export async function archiveBuiltins(origin: string): Promise<Archive> {
  if (!['https://www.ripsy.fun', 'https://ripsy.fun'].includes(origin)) throw new Error('Builtin archive requires the exact existing RIPSY public origin');
  const archive: Archive = { files: [], assets: new Map() };
  for (const figure of BUILTIN_FIGURES) {
    const urls = registeredFigureUrls(figure, origin);
    for (const [kind, ext, expected, max] of [
      ['rive', 'riv', figure.animation, 8 * 1048576], ['png', 'png', figure.portrait, 4 * 1048576], ['metadata', 'json', undefined, 16384],
    ] as const) {
      const sourceUrl = urls[kind];
      const response = await fetch(sourceUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > max) throw new Error('Builtin archive resource unavailable');
      const chunks: Buffer[] = []; let size = 0;
      const reader = response.body.getReader();
      try {
        for (;;) {
          const item = await reader.read(); if (item.done) break;
          size += item.value.length;
          if (size > max) { await reader.cancel(); throw new Error('Builtin archive exceeds byte limit'); }
          chunks.push(Buffer.from(item.value));
        }
      } finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks), sha256 = createHash('sha256').update(bytes).digest('hex');
      if (expected && (expected.sha256 !== sha256 || expected.bytes !== bytes.length)) throw new Error('Builtin archive does not match the published figure contract');
      if (kind === 'metadata') {
        const data = JSON.parse(bytes.toString());
        if (!data.attributes?.some((attribute: { trait_type?: string; value?: string }) => attribute.trait_type === 'Figure' && attribute.value === figure.id)) throw new Error('Wrong builtin metadata identity');
      }
      const filename = `${sha256}.${ext}`;
      archive.assets.set(filename, bytes); archive.files.push({ figureId: figure.id, kind, sourceUrl, filename, sha256, bytes: bytes.length });
    }
  }
  return archive;
}

/** Read-only source inspection. Never exports secrets/receipts to stdout/disk. */
async function inspect(redis: MigrationRedis, prefix: string, config: ShopConfig, archive: Archive) {
  const records: Record_[] = [], source: [string, string | null][] = [];
  const assets = new Map<string, Buffer>(archive.assets);
  const read = async (key: string) => { const value = await redis.get(key); source.push([key, value]); return value; };
  const settings = [['prices', `${prefix}:shop:admin:prices`], ['pack', `${prefix}:shop:admin:backend-pack`], ['registry', `${prefix}:shop:figure-registry:v1`]] as const;
  for (const [name, key] of settings) {
    const raw = await read(key);
    if (raw) records.push({ path: `settings/${name}`, payload: commercePayload(raw) });
  }
  const registry = records.find(record => record.path === 'settings/registry')?.payload;
  const blob = async (filename: string, size: number) => {
    if (assets.has(filename)) return;
    const raw = await read(`${prefix}:shop:figure-registry:v1:asset:${filename}`);
    if (!raw) throw new Error('Published/draft resource is missing; migration aborted');
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== filename.split('.')[0]) throw new Error('Source resource failed integrity verification');
    assets.set(filename, bytes);
  };
  for (const entry of registry?.entries ?? []) {
    const f = entry.registration;
    await blob(`${f.animation.sha256}.riv`, f.animation.bytes);
    await blob(`${f.portrait.sha256}.png`, f.portrait.bytes);
    await blob(`${entry.metadata.sha256}.json`, entry.metadata.bytes);
  }
  const draftRaw = await read(`${prefix}:shop:figure-registry:v1:draft`);
  if (draftRaw) {
    const { riveBase64, pngBase64, ...draft } = JSON.parse(draftRaw);
    if (draft.view.expiresAt > Date.now()) {
      for (const [filename, bytes, size] of [
        [`${draft.view.riveSha256}.riv`, Buffer.from(riveBase64, 'base64'), draft.view.riveBytes],
        [`${draft.view.pngSha256}.png`, Buffer.from(pngBase64, 'base64'), draft.view.pngBytes],
      ] as const) {
        if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== filename.split('.')[0]) throw new Error('Draft integrity verification failed');
        assets.set(filename, bytes);
      }
      records.push({ path: 'settings/draft', payload: draft });
    }
  }
  const pending = await redis.zRangeWithScores(`${prefix}:packs:pending`, 0, -1);
  source.push([`${prefix}:packs:pending`, canonicalCommerce(pending)]);
  const pendingIds = new Map(pending.map(value => [value.value, value.score]));
  for (const [kind, sourceName, targetName] of [['shop', 'shop', 'shopOrders'], ['pack', 'packs', 'packOrders']] as const) {
    const keys = new Set<string>();
    for await (const batch of redis.scanIterator({ MATCH: `${prefix}:${sourceName}:order:*`, COUNT: 100 })) for (const key of batch) keys.add(key);
    for (const key of [...keys].sort()) {
      const id = key.split(':').at(-1)!;
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Unrecognized source order ID; no order was discarded');
      const raw = await read(key); if (!raw) throw new Error('Source changed during migration; retry inspection');
      const payload = commercePayload(raw);
      if (payload.order?.id !== id || typeof payload.playerId !== 'string') throw new Error('Invalid source receipt identity');
      records.push({ path: `${targetName}/${id}`, payload, pendingAt: kind === 'pack' ? pendingIds.get(id) ?? null : null });
      if (kind === 'pack') pendingIds.delete(id);
    }
  }
  if (pendingIds.size) throw new Error('Pending pack index references missing receipts; manual recovery required');
  // Immutable compatibility baseline lives alongside dynamic registrations in
  // Firestore. Original URLs/issued NFT URIs remain unchanged, not rewritten.
  records.push({ path: 'settings/catalog', payload: { schema: 1, builtins: BUILTIN_FIGURES.map(figure => ({ ...figure, resources: registeredFigureUrls(figure, config.publicOrigin) })), archive: archive.files } });
  const sourceHash = hash(source.sort(([a], [b]) => a.localeCompare(b)));
  const recordsHash = hash(records.sort((a, b) => a.path.localeCompare(b.path)));
  return { records, assets, sourceHash, recordsHash };
}

/** Copy -> verify target -> repeat source read -> seal. Requires a frozen,
 * Redis-backed source. The caller activates Firestore ONLY after this returns.
 * Source Redis is never changed, flushed, made public or used as fallback.
 */
export async function migrateCommerce(redis: MigrationRedis, store: FirebaseCommerce, config: ShopConfig, options: { apply: boolean; maintenance: boolean; sourceMode: string; archiveBuiltins?: boolean }) {
  if (options.sourceMode !== 'redis' || (options.apply && !options.maintenance)) throw new Error('Migration requires Redis source and explicit checkout maintenance');
  const marker = store.db.doc(`${store.root}/settings/migration`);
  if ((await marker.get()).data()?.state === 'verified') throw new Error('Target already sealed; never recopy stale Redis over active commerce');
  const archive = options.archiveBuiltins ? await archiveBuiltins(config.publicOrigin) : { files: [], assets: new Map<string, Buffer>() };
  const snapshot = await inspect(redis, store.namespace, config, archive);
  const report = { schema: 1, namespace: store.namespace, sourceHash: snapshot.sourceHash, recordsHash: snapshot.recordsHash,
    settings: snapshot.records.filter(value => value.path.startsWith('settings/')).length,
    shopOrders: snapshot.records.filter(value => value.path.startsWith('shopOrders/')).length,
    packOrders: snapshot.records.filter(value => value.path.startsWith('packOrders/')).length,
    assets: snapshot.assets.size, assetBytes: [...snapshot.assets.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
  if (!options.apply) return { ...report, state: 'read-only' };
  await store.withFigures(async token => {
    await marker.set({ ...report, state: 'copying', updatedAt: Timestamp.now() });
    for (const [filename, bytes] of snapshot.assets) await store.putAsset(filename, bytes);
    for (const record of snapshot.records) {
      const ref = store.db.doc(`${store.root}/${record.path}`), fingerprint = hash(record.payload);
      await store.db.runTransaction(async tx => {
        const before = (await tx.get(ref)).data();
        if (before && hash(before.payload) !== fingerprint) throw new Error('Target differs from source; refusing to overwrite durable data');
        tx.set(ref, { payload: record.payload, ...(record.pendingAt !== undefined ? { pendingAt: record.pendingAt, retentionSeconds: 0 } : {}), migrationSourceHash: fingerprint, updatedAt: Timestamp.now() });
      });
    }
    // Verify every copied nested field, quote, player ID, private seed/result,
    // exact signed bytes and pending time without logging any of those values.
    for (const record of snapshot.records) {
      const copied = (await store.db.doc(`${store.root}/${record.path}`).get()).data();
      if (!copied || hash(copied.payload) !== hash(record.payload) || (record.pendingAt !== undefined && copied.pendingAt !== record.pendingAt)) throw new Error('Copied commerce verification failed');
    }
    for (const [filename, bytes] of snapshot.assets) if (!(await store.asset(filename)).equals(bytes)) throw new Error('Copied asset bytes differ');
    for (const collection of ['shopOrders', 'packOrders', 'settings']) {
      const rows = await store.db.pipeline().collection(`${store.root}/${collection}`).execute();
      const expected = new Set(snapshot.records.filter(record => record.path.startsWith(collection + '/')).map(record => record.path.split('/')[1]));
      if (collection === 'settings') expected.add('migration');
      if (rows.results.length !== expected.size || rows.results.some(row => !expected.has(row.id!))) throw new Error('Unexpected target records; refusing cutover');
    }
    const final = await inspect(redis, store.namespace, config, archive);
    if (final.sourceHash !== snapshot.sourceHash || final.recordsHash !== snapshot.recordsHash) throw new Error('Redis changed during copy; checkout must remain paused');
    await store.db.runTransaction(async tx => {
      const lease = (await tx.get(store.db.doc(`${store.root}/leases/figures`))).data();
      if (lease?.token !== token || lease.until <= Date.now()) throw new Error('Migration lease expired; refusing cutover');
      const current = (await tx.get(marker)).data();
      if (current?.state !== 'copying' || current.sourceHash !== report.sourceHash) throw new Error('Migration changed; refusing cutover');
      tx.set(marker, { ...report, state: 'verified', database: store.db.databaseId, bucket: store.bucket.name, location: 'europe-west3', verifiedAt: Timestamp.now() });
    });
  });
  await store.assertReady();
  return { ...report, state: 'verified' };
}
