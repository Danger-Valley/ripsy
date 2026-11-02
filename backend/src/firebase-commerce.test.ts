import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { FirebaseCommerce, commercePayload, createFirebaseCommerce } from './firebase-commerce.js';
import { ShopService, type ShopRedis } from './shop-service.js';
import { loadShopConfig } from './shop-config.js';
import type { ShopChain } from './shop-chain.js';
import { FigureAdminService } from './figure-admin.js';
import { FIGURES, installAdminFigures } from './figure-registry.js';
import { ShopPricingService } from './shop-pricing.js';
import { BackendPackSettingsService } from './backend-pack-settings.js';
import { DEFAULT_BACKEND_PACK } from './backend-pack-settings.js';
import { migrateCommerce, type MigrationRedis } from './commerce-migration.js';
import { canonicalCommerce } from './commerce-persistence.js';
import { BackendPackService } from './backend-pack-service.js';
import type { BackendPackChain } from './backend-pack-chain.js';

test('commerce config is explicitly opt-in; unknown mode, incomplete target and oversized records fail closed', async () => {
  assert.equal(await createFirebaseCommerce({}, 'ripsy'), undefined);
  await assert.rejects(createFirebaseCommerce({ COMMERCE_STORAGE: 'unknown' }, 'ripsy'), /Unknown/);
  await assert.rejects(createFirebaseCommerce({ COMMERCE_STORAGE: 'firebase' }, 'ripsy'), /required/);
  assert.throws(() => commercePayload('[]'), /Invalid/);
  assert.throws(() => commercePayload(JSON.stringify({ x: 'a'.repeat(750001) })), /limit/);
});

// Explicit opt-in ONLY. Cloud tests use the newly provisioned DB, a unique
// test-only namespace, mocked chain calls and private unregistered objects.
// No app orders, wallet/authority keys, real RPC or payment are ever accessed.
const keyPath = process.env.FIREBASE_COMMERCE_TEST_CREDENTIALS;
test('Firestore + Storage: real transaction/fence/publication/restart and payment ordering', { skip: !keyPath, timeout: 180000 }, async t => {
  const credential = JSON.parse(readFileSync(keyPath!, 'utf8'));
  assert.equal(credential.project_id, 'ripsy-app');
  assert.equal(credential.client_email, 'ripsy-commerce@ripsy-app.iam.gserviceaccount.com');
  const app = initializeApp({ projectId: 'ripsy-app', storageBucket: 'ripsy-app.firebasestorage.app', credential: cert(credential) }, `commerce-test-${randomUUID()}`);
  const db = getFirestore(app, 'ripsy-commerce');
  const namespace = `itest:${randomUUID()}`, bucket = getStorage(app).bucket();
  const store = new FirebaseCommerce(db, bucket, namespace);
  const replica = new FirebaseCommerce(db, bucket, namespace);
  const base = structuredClone(FIGURES);
  const cleanupRoots = [store.root];
  const redis: ShopRedis = { get: async () => { throw Error('Durable records must not read Redis'); }, set: async () => { throw Error('Durable locks must not use Redis'); }, eval: async script => { assert.ok(script.includes('INCR')); return 1; } };
  try {
    await t.test('unsealed or wrong targets cannot activate and missing documents never fall back to Redis', async () => {
      await assert.rejects(store.assertReady(), /not verified/);
      assert.equal(await store.setting('prices'), null);
      const prices = new ShopPricingService(redis, loadShopConfig({}), namespace, store);
      assert.equal((await prices.get()).revision, 0);
      const settings = new BackendPackSettingsService(redis, namespace, false, store);
      assert.equal((await settings.catalog(false)).available, false);
      assert.equal((await settings.get()).catalog.payment.amount, '10000000');
    });
    await t.test('frozen Redis copy preserves IDs, player ownership, exact signed snapshots, paid entropy and pending index; verified targets cannot be recopied', async () => {
      const target = new FirebaseCommerce(db, bucket, `${namespace}-m`); cleanupRoots.push(target.root);
      const id = 'b'.repeat(64), packId = 'c'.repeat(64);
      const oldShop = { playerId: 'old-player', order: { id, buyer: 'original-buyer', transaction: 'EXACT-PREPARED-FIXTURE', signature: 'recorded-signature', priceLamports: '0', tokenPayment: { amount: '1350000000', decimals: 6, symbol: 'SKR' }, assets: ['same-asset-1', 'same-asset-2', 'same-asset-3'], quantity: 3 }, signed: 'EXACT-SIGNED-FIXTURE' };
      const paidPack = { playerId: 'old-player', nonce: 'private-original-seed', paid: true, order: { id: packId, buyer: 'original-buyer', result: 'ore', randomness: 'same-saved-draw', status: 'ready-to-claim' }, delivery: { transaction: 'EXACT-DELIVERY-FIXTURE' } };
      const data = new Map([
        [`${target.namespace}:shop:admin:prices`, JSON.stringify({ revision: 12, amounts: { fig2: '1000000' }, audit: [{ revision: 12 }] })],
        [`${target.namespace}:shop:admin:backend-pack`, JSON.stringify({ catalog: { ...DEFAULT_BACKEND_PACK, version: 2 }, audit: [] })],
        [`${target.namespace}:shop:order:${id}`, JSON.stringify(oldShop)],
        [`${target.namespace}:packs:order:${packId}`, JSON.stringify(paidPack)],
      ]);
      const source: MigrationRedis = {
        get: async key => data.get(key) ?? null,
        async *scanIterator({ MATCH }) { yield [...data.keys()].filter(key => key.startsWith(MATCH.slice(0, -1))); },
        zRangeWithScores: async () => [{ value: packId, score: 123 }],
      };
      const config = loadShopConfig({}); const before = canonicalCommerce([...data]);
      const dry = await migrateCommerce(source, target, config, { apply: false, maintenance: false, sourceMode: 'redis' });
      assert.equal(dry.state, 'read-only'); assert.equal(dry.shopOrders, 1); assert.equal(dry.packOrders, 1);
      await assert.rejects(migrateCommerce(source, target, config, { apply: true, maintenance: false, sourceMode: 'redis' }), /maintenance/);
      const copied = await migrateCommerce(source, target, config, { apply: true, maintenance: true, sourceMode: 'redis' });
      assert.equal(copied.state, 'verified'); await target.assertReady();
      assert.equal(canonicalCommerce(JSON.parse((await target.order('shop', id))!)), canonicalCommerce(oldShop));
      assert.equal(canonicalCommerce(JSON.parse((await target.order('pack', packId))!)), canonicalCommerce(paidPack));
      assert.equal((await db.doc(`${target.root}/packOrders/${packId}`).get()).data()!.pendingAt, 123);
      assert.equal(canonicalCommerce([...data]), before);
      await assert.rejects(migrateCommerce(source, target, config, { apply: true, maintenance: true, sourceMode: 'redis' }), /already sealed/);
      const bad = new FirebaseCommerce(db, bucket, `${namespace}-bad`); cleanupRoots.push(bad.root);
      await db.doc(`${bad.root}/settings/prices`).set({ payload: { revision: 99 } });
      // Same source shapes remapped to this namespace; no overwrite on collision.
      const badSource: MigrationRedis = { ...source, get: key => source.get(key.replace(bad.namespace, target.namespace)), async *scanIterator({ MATCH }) { for await (const keys of source.scanIterator({ MATCH: MATCH.replace(bad.namespace, target.namespace), COUNT: 100 })) yield keys.map(key => key.replace(target.namespace, bad.namespace)); } };
      await assert.rejects(migrateCommerce(badSource, bad, config, { apply: true, maintenance: true, sourceMode: 'redis' }), /refusing to overwrite/);
      await assert.rejects(bad.assertReady(), /not verified/);
      assert.equal((await db.doc(`${bad.root}/settings/prices`).get()).data()!.payload.revision, 99);
    });
    await t.test('concurrent catalog CAS commits only one revision including its audit', async () => {
      const save = (amount: string) => store.saveSetting('prices', 0, JSON.stringify({ revision: 1, amounts: { fig2: amount }, audit: [{ amount }] }));
      const result = await Promise.all([save('1'), save('2')]);
      assert.equal(result.filter(Boolean).length, 1);
      const value = JSON.parse((await replica.setting('prices'))!);
      assert.equal(value.revision, 1); assert.equal(value.audit[0].amount, value.amounts.fig2);
    });
    await t.test('expired lease is fenced; a successor cannot be overwritten by a slow former replica', async () => {
      const id = 'a'.repeat(64), payload = (status: string) => JSON.stringify({ playerId: 'original', order: { id, buyer: 'buyer', status } });
      await store.withOrder('pack', id, async writer => {
        assert.equal(await writer.read(), null); await writer.save(payload('prepared'), true);
        await assert.rejects(replica.withOrder('pack', id, async () => undefined), /updating/);
        await db.doc(`${store.root}/leases/pack-${id}`).update({ until: Date.now() - 1 });
        await replica.withOrder('pack', id, async next => { await next.read(); await next.save(payload('ready-to-claim'), true); });
        await assert.rejects(writer.save(payload('obsolete'), true), /updating/);
      });
      assert.equal(JSON.parse((await replica.order('pack', id))!).order.status, 'ready-to-claim');
      await db.doc(`${store.root}/packOrders/${id}`).update({ pendingAt: 1 });
      assert.deepEqual(await store.duePacks(Date.now()), [id]);
      await store.withOrder('pack', id, async writer => {
        const saved = JSON.parse((await writer.read())!); saved.paid = true; saved.order.status = 'confirmed';
        await writer.save(JSON.stringify(saved), false, 0);
      });
      assert.deepEqual(await replica.duePacks(Date.now()), []);
      assert.equal((await db.doc(`${store.root}/packOrders/${id}`).get()).data()!.retentionSeconds, 0);
      await replica.withOrder('pack', id, async writer => {
        const saved = JSON.parse((await writer.read())!); saved.playerId = 'hijacker';
        await assert.rejects(writer.save(JSON.stringify(saved), false), /owner mismatch/);
      });
    });
    await t.test('signed direct purchase is durable before mock broadcast; replica recovery never prepares or charges again', async () => {
      let prepares = 0, sends = 0, state: 'pending' | 'confirmed' = 'pending';
      const config = { ...loadShopConfig({}), enabled: true, cluster: 'mainnet-beta' as const, treasury: 'So11111111111111111111111111111111111111112', collection: 'SysvarRent111111111111111111111111111111111' };
      let id = '';
      const chain: ShopChain = {
        async prepare() { prepares++; return { asset: '11111111111111111111111111111111', transaction: 'unsigned-fixture', lastValidBlockHeight: 123, networkFeeLamports: '5000' }; },
        validateSigned() { return 's'.repeat(64); },
        async send(bytes) { const saved = JSON.parse((await store.order('shop', id))!); assert.equal(saved.signed, bytes); assert.equal(saved.order.signature, 's'.repeat(64)); sends++; throw Error('Mock lost transport response'); },
        async status() { return state; },
      };
      const service = new ShopService(redis, config, chain, namespace, undefined, undefined, store);
      const other = new ShopService(redis, config, chain, namespace, undefined, undefined, replica);
      const request = { figureId: 'alien', buyer: '11111111111111111111111111111111', idempotencyKey: 'firebase-atomic-fixture-request' };
      const prepared = await service.create('original-player', request); id = prepared.id;
      assert.deepEqual(await other.create('original-player', request), prepared); assert.equal(prepares, 1);
      await assert.rejects(other.get('another-player', id), /not found/);
      await service.submit('original-player', id, 'signed-fixture'); assert.ok(sends >= 1);
      const before = await store.order('shop', id), sendsBefore = sends;
      await other.reconcile('new-session', id, { transaction: prepared.transaction });
      assert.equal(await store.order('shop', id), before); assert.equal(sends, sendsBefore);
      state = 'confirmed'; assert.equal((await other.get('original-player', id)).status, 'confirmed');
      assert.equal(JSON.parse((await store.order('shop', id))!).signed, undefined); assert.equal(prepares, 1);
      const save = store.withOrder.bind(store);
      store.withOrder = async (kind, orderId, action) => save(kind, orderId, writer => action({ ...writer, save: async () => { throw Error('Mock durable write outage'); } }));
      await assert.rejects(service.create('original-player', { ...request, idempotencyKey: 'firebase-write-outage-request' }), /write outage/);
      assert.equal(sends, sendsBefore);
    });
    await t.test('Firestore pack state machine preserves one paid draw and exact delivery across replicas and recovery', async () => {
      let paid = false, delivered = false, draws = 0, deliveries = 0, prepares = 0;
      const sends: string[] = [], buyer = '11111111111111111111111111111111';
      const settings = new BackendPackSettingsService(redis, namespace, true, replica);
      const chain: BackendPackChain = {
        async prepare(address, _id, _nonce, catalog) { prepares++; return { engine: 'backend', buyer: address, cluster: 'mainnet-beta', transaction: 'AQ==', deliveryFunding: { recipient: 'So11111111111111111111111111111111111111112', amountLamports: '2759680' }, receipt: buyer, asset: buyer, edition: buyer, version: catalog.version, payment: catalog.payment, drops: catalog.drops, networkFeeLamports: '2769680', lastValidBlockHeight: 100 }; },
        validateSigned() { return 's'.repeat(64); },
        async send(bytes) { sends.push(bytes); },
        async paymentStatus(order) { return { status: paid ? 'paid' : 'pending', signature: order.signature ?? (paid ? 's'.repeat(64) : null) }; },
        async prepareDelivery() { deliveries++; return { transaction: 'same-signed-delivery-fixture', signature: 'd'.repeat(64), lastValidBlockHeight: 200 }; },
        async deliveryStatus() { return delivered ? 'confirmed' : 'pending'; },
      };
      const service = () => new BackendPackService(redis, settings, chain, true, 'https://www.ripsy.fun', namespace, undefined, () => { draws++; return new Uint8Array(32).fill(42); }, replica);
      const input = { buyer, idempotencyKey: 'firebase-pack-fixture-request' };
      const first = await service().create('original-player', input);
      await service().submit('original-player', first.id, 'same-signed-payment-fixture');
      const raw = JSON.parse((await replica.order('pack', first.id))!); assert.equal(raw.signed, 'same-signed-payment-fixture');
      paid = true; const reward = await service().get('original-player', first.id);
      assert.equal(reward.status, 'ready-to-claim'); assert.ok(reward.result); assert.ok(reward.randomness);
      const receipt = JSON.parse((await replica.order('pack', first.id))!);
      assert.equal(receipt.paid, true); assert.equal(receipt.delivery.transaction, 'same-signed-delivery-fixture');
      assert.deepEqual(await service().get('original-player', first.id), reward);
      assert.equal(draws, 1); assert.equal(deliveries, 1); assert.equal(prepares, 1);
      await assert.rejects(service().get('new-player', first.id), /not found/);
      delivered = true; assert.equal((await service().get('original-player', first.id)).status, 'confirmed');
      assert.equal((await db.doc(`${store.root}/packOrders/${first.id}`).get()).data()!.retentionSeconds, 0);
      assert.equal((await db.doc(`${store.root}/packOrders/${first.id}`).get()).data()!.pendingAt, null);
      assert.ok(sends.every(value => value === 'same-signed-payment-fixture' || value === 'same-signed-delivery-fixture'));
    });
    await t.test('private content-addressed bytes precede an atomic registry commit, survive restart and remain unpublished until committed', async () => {
      const service = new FigureAdminService(redis, 'https://api.ripsy.fun', namespace, async () => undefined, store);
      const png = readFileSync(new URL('../../frontend/apps/web/public/figures/alien.png', import.meta.url));
      const rive = readFileSync(new URL('../../frontend/apps/web/public/figures/alien.riv', import.meta.url));
      const input = { requestId: 'firebase-figure-fixture-request', id: 'firebase-fixture-fighter', name: 'Fixture only', description: 'Private integration fixture, not app catalog.', currency: 'SKR', price: '450', riveBase64: rive.toString('base64'), pngBase64: png.toString('base64') };
      const draft = (await service.prepare('admin', async () => input)).draft!;
      const saved = (await db.doc(`${store.root}/settings/draft`).get()).data()!.payload;
      assert.equal(saved.riveBase64, undefined); assert.equal(saved.pngBase64, undefined);
      assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 10000);
      await assert.rejects(service.resource(`${draft.riveSha256}.riv`), /not found/);
      await assert.rejects(service.publish('another-admin', { requestId: input.requestId, expectedRevision: 0 }), /expired or changed/);
      const published = await service.publish('admin', { requestId: input.requestId, expectedRevision: 0 });
      assert.equal(published.revision, 1); assert.equal(published.draft, null);
      const restarted = new FigureAdminService(redis, 'https://api.ripsy.fun', namespace, async () => undefined, replica);
      assert.deepEqual(await restarted.snapshot('admin'), published);
      assert.deepEqual((await restarted.resource(`${draft.pngSha256}.png`)).bytes, png);
      assert.deepEqual(await restarted.publish('admin', { requestId: input.requestId, expectedRevision: 0 }), published);
      await assert.rejects(store.putAsset(`${createHash('sha256').update(png).digest('hex')}.png`, Buffer.of(1)), /Invalid/);
      const anonymous = await fetch(`https://storage.googleapis.com/${bucket.name}/figures/${namespace}/${draft.pngSha256}.png`);
      assert.ok([401, 403].includes(anonymous.status));
    });
  } finally {
    // Explicit unique test namespace only; never scan/delete live app receipts.
    const collections = ['settings', 'shopOrders', 'packOrders', 'leases'];
    for (const root of cleanupRoots) for (const name of collections) {
      const refs = await db.collection(`${root}/${name}`).listDocuments();
      for (const ref of refs) await ref.delete();
    }
    FIGURES.splice(0, FIGURES.length, ...base); installAdminFigures([]);
    await db.terminate(); await deleteApp(app);
    console.log(`Private test objects retained for operator cleanup only: figures/${namespace}/`);
  }
});
