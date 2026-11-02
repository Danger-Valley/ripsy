import { createHash, randomUUID } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { CommercePersistence, OrderKind, OrderWriter } from './commerce-persistence.js';
import { canonicalCommerce } from './commerce-persistence.js';
import { ShopError } from './shop-error.js';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
type Payload = Record<string, any>;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const conflict = () => new ShopError('Purchase or catalog is updating. Reload its saved status before trying again.', 409);
export function commercePayload(raw: string): Payload {
  if (Buffer.byteLength(raw) > 750_000) throw new ShopError('Commerce record exceeds the durable storage limit.', 503);
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid commerce record');
  return data as Payload;
}

/** Firestore is the only durable source after explicit migration/cutover.
 * No Redis fallback/dual-write: failures stop before a payment broadcast.
 * Network/chain side effects NEVER run inside a retryable DB transaction.
 */
export class FirebaseCommerce implements CommercePersistence {
  readonly root: string;
  constructor(readonly db: Firestore, readonly bucket: Bucket, readonly namespace = 'ripsy') {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(namespace)) throw new Error('Invalid commerce namespace');
    this.root = `commerce/${namespace}`;
  }
  private doc(path: string) { return this.db.doc(`${this.root}/${path}`); }
  private orderDoc(kind: OrderKind, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ShopError('Purchase not found', 404);
    return this.doc(`${kind === 'shop' ? 'shopOrders' : 'packOrders'}/${id}`);
  }
  async assertReady() {
    const data = (await this.doc('settings/migration').get()).data();
    if (data?.schema !== 1 || data.state !== 'verified' || data.namespace !== this.namespace
      || data.database !== this.db.databaseId || data.bucket !== this.bucket.name || data.location !== 'europe-west3') throw new Error('Firebase commerce migration is not verified; refusing an empty or wrong store');
  }
  async setting(name: 'prices' | 'pack' | 'registry') {
    const data = (await this.doc(`settings/${name}`).get()).data();
    return data ? JSON.stringify(data.payload) : null;
  }
  async saveSetting(name: 'prices' | 'pack', revision: number, raw: string) {
    const payload = commercePayload(raw), ref = this.doc(`settings/${name}`);
    return this.db.runTransaction(async tx => {
      const before = (await tx.get(ref)).data()?.payload;
      const current = name === 'prices' ? before?.revision ?? 0 : before?.catalog?.version ?? 1;
      if (current !== revision) return false;
      tx.set(ref, { payload, updatedAt: Timestamp.now() }); return true;
    });
  }
  async order(kind: OrderKind, id: string) {
    const data = (await this.orderDoc(kind, id).get()).data();
    return data ? JSON.stringify(data.payload) : null;
  }
  private async verifyLease(tx: Transaction, ref: DocumentReference, token: string) {
    const lease = (await tx.get(ref)).data();
    if (lease?.token !== token || lease.until <= Date.now()) throw conflict();
  }
  private async leased<T>(name: string, action: (token: string, ref: DocumentReference) => Promise<T>): Promise<T> {
    const ref = this.doc(`leases/${name}`), token = randomUUID();
    await this.db.runTransaction(async tx => {
      const before = (await tx.get(ref)).data();
      if (before?.until > Date.now()) throw conflict();
      tx.set(ref, { token, until: Date.now() + 120_000 });
    });
    try { return await action(token, ref); }
    finally {
      // A release failure must not turn a committed purchase into an error.
      // The bounded lease expires; never delete a successor's token.
      await this.db.runTransaction(async tx => {
        if ((await tx.get(ref)).data()?.token === token) tx.delete(ref);
      }).catch(() => undefined);
    }
  }
  withOrder<T>(kind: OrderKind, id: string, action: (writer: OrderWriter) => Promise<T>): Promise<T> {
    const ref = this.orderDoc(kind, id);
    return this.leased(`${kind}-${id}`, async (token, lease) => {
      let observed = false, existed = false;
      return action({
        read: async () => { const raw = await this.order(kind, id); observed = true; existed = raw !== null; return raw; },
        save: async (raw, pending, retentionSeconds = 0) => {
          const payload = commercePayload(raw);
          if (payload.order?.id !== id || typeof payload.playerId !== 'string') throw new Error('Order identity mismatch');
          await this.db.runTransaction(async tx => {
            await this.verifyLease(tx, lease, token);
            const current = (await tx.get(ref)).data();
            if (observed && !existed && current) throw conflict();
            if (observed && existed && !current) throw conflict();
            if (current && (current.payload.playerId !== payload.playerId || current.payload.order.buyer !== payload.order.buyer)) throw new Error('Immutable purchase owner mismatch');
            if (current) {
              const immutable = (order: Payload) => Object.fromEntries(Object.entries(order).filter(([key]) => !['status', 'signature', 'error', 'result', 'randomness'].includes(key)));
              if (canonicalCommerce(immutable(current.payload.order)) !== canonicalCommerce(immutable(payload.order)) || current.payload.nonce !== payload.nonce) throw new Error('Immutable purchase quote mismatch');
              if (current.payload.paid && !payload.paid) throw new Error('Paid entitlement cannot be removed');
              for (const key of ['result', 'randomness']) if (current.payload.order[key] && current.payload.order[key] !== payload.order[key]) throw new Error('Saved pack draw cannot change');
            }
            tx.set(ref, { payload, pendingAt: pending ? Date.now() + 15_000 : null,
              // Advisory retention only. No TTL policy deletes paid receipts.
              retentionSeconds, updatedAt: Timestamp.now() });
          });
          existed = true; observed = true;
        },
      });
    });
  }
  async duePacks(now: number) {
    // Enterprise Pipeline filtering/order/limit execute in the database.
    const { field } = await import('@google-cloud/firestore/pipelines');
    const result = await this.db.pipeline().collection(`${this.root}/packOrders`)
      .where(field('pendingAt').greaterThanOrEqual(0)).where(field('pendingAt').lessThanOrEqual(now))
      .sort(field('pendingAt').ascending()).limit(5).execute();
    return result.results.map(row => row.ref!.id);
  }
  withFigures<T>(action: (token: string) => Promise<T>) { return this.leased('figures', token => action(token)); }
  private filename(filename: string) {
    if (!/^[a-f0-9]{64}\.(riv|png|json)$/.test(filename)) throw new ShopError('Figure resource not found.', 404);
    return `figures/${this.namespace}/${filename}`;
  }
  async asset(filename: string) {
    const file = this.bucket.file(this.filename(filename));
    const [metadata] = await file.getMetadata();
    if (!Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) < 1 || Number(metadata.size) > 8 * 1048576) throw new ShopError('Figure resource verification failed.', 503);
    const [bytes] = await file.download({ validation: 'crc32c' });
    if (bytes.length !== Number(metadata.size) || digest(bytes) !== filename.split('.')[0]) throw new ShopError('Figure resource verification failed.', 503);
    return bytes;
  }
  async putAsset(filename: string, bytes: Buffer) {
    const path = this.filename(filename);
    if (digest(bytes) !== filename.split('.')[0] || !bytes.length || bytes.length > 8 * 1048576) throw new Error('Invalid immutable figure bytes');
    try {
      await this.bucket.file(path).save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { cacheControl: 'public,max-age=31536000,immutable', contentType: filename.endsWith('.png') ? 'image/png' : filename.endsWith('.json') ? 'application/json' : 'application/octet-stream', metadata: { sha256: digest(bytes) } } });
    } catch (error) {
      if ((error as { code?: number }).code !== 412) throw error;
      if (!(await this.asset(filename)).equals(bytes)) throw new Error('Immutable asset collision');
    }
  }
  async draft() {
    const data = (await this.doc('settings/draft').get()).data()?.payload;
    if (!data || data.view.expiresAt <= Date.now()) return null;
    const [rive, png] = await Promise.all([this.asset(`${data.view.riveSha256}.riv`), this.asset(`${data.view.pngSha256}.png`)]);
    return JSON.stringify({ ...data, riveBase64: rive.toString('base64'), pngBase64: png.toString('base64') });
  }
  async saveDraft(token: string, raw: string) {
    // Raw drafts may exceed Firestore's 1 MiB cap; bytes go ONLY to Storage.
    const { riveBase64, pngBase64, ...payload } = JSON.parse(raw);
    await Promise.all([this.putAsset(`${payload.view.riveSha256}.riv`, Buffer.from(riveBase64, 'base64')), this.putAsset(`${payload.view.pngSha256}.png`, Buffer.from(pngBase64, 'base64'))]);
    await this.db.runTransaction(async tx => {
      await this.verifyLease(tx, this.doc('leases/figures'), token);
      const ref = this.doc('settings/draft'), before = (await tx.get(ref)).data()?.payload;
      if (before?.view.expiresAt > Date.now()) throw conflict();
      tx.set(ref, { payload, updatedAt: Timestamp.now() });
    });
  }
  async discardDraft(token: string, fingerprint: string) {
    await this.db.runTransaction(async tx => {
      await this.verifyLease(tx, this.doc('leases/figures'), token);
      const ref = this.doc('settings/draft');
      if ((await tx.get(ref)).data()?.payload?.fingerprint !== fingerprint) throw conflict();
      tx.delete(ref);
    });
  }
  async publishFigures(token: string, revision: number, fingerprint: string, raw: string, assets: { filename: string; bytes: Buffer }[]) {
    const payload = commercePayload(raw);
    // Objects are create-only and private until the DB registry commits.
    // A failed commit can leave harmless unreferenced immutable bytes, never a
    // partially public registration or a deleted/mutated issued-NFT resource.
    await Promise.all(assets.map(asset => this.putAsset(asset.filename, asset.bytes)));
    await this.db.runTransaction(async tx => {
      await this.verifyLease(tx, this.doc('leases/figures'), token);
      const registry = this.doc('settings/registry'), draft = this.doc('settings/draft');
      const before = (await tx.get(registry)).data()?.payload;
      const pending = (await tx.get(draft)).data()?.payload;
      if ((before?.revision ?? 0) !== revision || pending?.fingerprint !== fingerprint || pending.view.expiresAt <= Date.now()) throw conflict();
      tx.set(registry, { payload, updatedAt: Timestamp.now() }); tx.delete(draft);
    });
  }
}

export async function createFirebaseCommerce(environment: NodeJS.ProcessEnv, namespace: string, requireReady = true): Promise<FirebaseCommerce | undefined> {
  const mode = environment.COMMERCE_STORAGE ?? 'redis';
  if (mode === 'redis') return undefined;
  if (mode !== 'firebase') throw new Error('Unknown COMMERCE_STORAGE');
  const projectId = environment.FIREBASE_COMMERCE_PROJECT_ID, databaseId = environment.FIREBASE_COMMERCE_DATABASE_ID, bucket = environment.FIREBASE_COMMERCE_BUCKET;
  if (!projectId || !databaseId || !bucket) throw new Error('Firebase commerce project/database/bucket are required');
  const name = 'ripsy-commerce';
  let app = getApps().find(value => value.name === name);
  if (!app) {
    const raw = environment.FIREBASE_COMMERCE_SERVICE_ACCOUNT_JSON;
    const serviceAccount = raw ? JSON.parse(raw) : undefined;
    if (serviceAccount && (serviceAccount.project_id !== projectId || serviceAccount.client_email !== `ripsy-commerce@${projectId}.iam.gserviceaccount.com`)) throw new Error('Wrong Firebase commerce service account identity');
    app = initializeApp({ projectId, storageBucket: bucket, credential: serviceAccount ? cert(serviceAccount) : applicationDefault() }, name);
  }
  const store = new FirebaseCommerce(getFirestore(app, databaseId), getStorage(app).bucket(), namespace);
  if (requireReady) await store.assertReady(); return store;
}
