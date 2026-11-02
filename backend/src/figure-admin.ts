import { createHash, randomUUID } from 'node:crypto';
import { FIGURE_UPLOAD_LIMITS, type AdminFigures, type FigureDraft } from '@rps/core/admin-figures';
import { decimalToUnits, unitsToDecimal } from '@rps/core/shop-admin';
import { isFigureId } from '@rps/core/shop';
import { BUILTIN_FIGURES, FIGURES, installAdminFigures, validateRegistrations, type Registration } from './figure-registry.js';
import type { ShopRedis } from './shop-service.js';
import { ShopError } from './shop-error.js';
import { decodeFigureUpload, validateFigurePng, validateFigureRive } from './figure-upload-validation.js';
import type { CommercePersistence } from './commerce-persistence.js';

interface Published { registration: Registration; requestId: string; publishedAt: number; publishedBy: string; metadata: { sha256: string; bytes: number } }
interface State { schema: 1; revision: number; usedBytes: number; entries: Published[] }
interface Draft { view: FigureDraft; owner: string; fingerprint: string; riveBase64: string; pngBase64: string; payment: Pick<Registration, 'tokenPayment' | 'priceLamports'> }
const empty = (): State => ({ schema: 1, revision: 0, usedBytes: 0, entries: [] });
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const currencies = [{ symbol: 'SOL', decimals: 9, mint: null }, ...BUILTIN_FIGURES.flatMap(f => f.tokenPayment ? [f.tokenPayment] : [])]
  .filter((value, i, all) => all.findIndex(v => v.symbol === value.symbol) === i);
const REQUEST = /^[A-Za-z0-9_-]{16,80}$/;
export const FIGURE_PUBLISH_CAS = `-- figure-publish-cas
if redis.call('GET',KEYS[3]) ~= ARGV[1] then return -2 end
local raw=redis.call('GET',KEYS[1]);local revision=0
if raw then revision=cjson.decode(raw).revision end
if revision ~= tonumber(ARGV[2]) then return 0 end
local pending=redis.call('GET',KEYS[2]);if not pending then return -1 end
local draft=cjson.decode(pending)
if draft.view.requestId ~= ARGV[3] or draft.fingerprint ~= ARGV[4] then return -1 end
local values={draft.riveBase64,draft.pngBase64,ARGV[6]}
for i=1,3 do local old=redis.call('GET',KEYS[i+3]);if old and old ~= values[i] then return -3 end end
for i=1,3 do redis.call('SET',KEYS[i+3],values[i]);end
redis.call('SET',KEYS[1],ARGV[5]);redis.call('DEL',KEYS[2]);return 1`;
const DRAFT_SAVE = `-- figure-draft-save
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]);return 1`;
const RELEASE_LOCK = "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";

/** Bounded append-only registrations; optional Firestore + immutable Storage.
 * No signing, mint or ownership operation.
 * A single 30-minute draft limits temporary upload storage to at most 12 MiB.
 */
export class FigureAdminService {
  private state: State = empty(); private lastRaw: string | null | undefined;
  private refreshing: Promise<void> | null = null;
  private key: string; private draftKey: string; private lockKey: string;
  constructor(private redis: ShopRedis, readonly assetOrigin: string, prefix = 'ripsy',
    private validateRive: (bytes: Buffer) => Promise<void> = validateFigureRive, private durable?: CommercePersistence) {
    const url = new URL(assetOrigin);
    if (url.protocol !== 'https:' || url.origin !== assetOrigin || url.username || url.password) throw new Error('SHOP_FIGURE_ASSET_ORIGIN must be an HTTPS origin');
    this.key = `${prefix}:shop:figure-registry:v1`; this.draftKey = `${this.key}:draft`; this.lockKey = `${this.key}:lock`;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const raw = this.durable ? await this.durable.setting('registry') : await this.redis.get(this.key);
      if (raw === this.lastRaw) return;
      const state = raw ? JSON.parse(raw) as State : empty();
      if (state.schema !== 1 || !Array.isArray(state.entries) || state.revision !== state.entries.length || state.entries.length > 255 - BUILTIN_FIGURES.length
        || !Number.isSafeInteger(state.usedBytes) || state.usedBytes < 0 || state.usedBytes > FIGURE_UPLOAD_LIMITS.storage) throw new Error('Invalid persistent figure registry');
      let used = 0; const requests = new Set<string>();
      for (const entry of state.entries) {
        const f = entry.registration;
        if (!f?.resources || !f.portrait || !REQUEST.test(entry.requestId) || requests.has(entry.requestId)
          || !Number.isSafeInteger(entry.publishedAt) || typeof entry.publishedBy !== 'string'
          || !/^[a-f0-9]{64}$/.test(entry.metadata?.sha256) || !Number.isSafeInteger(entry.metadata.bytes) || entry.metadata.bytes < 8 || entry.metadata.bytes > 16384) throw new Error('Invalid persistent fighter');
        for (const [kind, digest] of [['rive', f.animation.sha256], ['png', f.portrait.sha256], ['metadata', entry.metadata.sha256]] as const) {
          const ext = kind === 'rive' ? 'riv' : kind === 'png' ? 'png' : 'json';
          const url = new URL(f.resources[kind]);
          if (url.pathname !== `/shop/figure-assets/${digest}.${ext}` || url.search || url.hash) throw new Error('Invalid persistent figure resource');
        }
        used += f.animation.bytes + f.portrait.bytes + entry.metadata.bytes; requests.add(entry.requestId);
      }
      if (used !== state.usedBytes) throw new Error('Invalid figure storage accounting');
      installAdminFigures(state.entries.map(e => e.registration));
      this.state = state; this.lastRaw = raw;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  private async readDraft(): Promise<Draft | null> {
    const raw = this.durable ? await this.durable.draft() : await this.redis.get(this.draftKey); if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (draft.view.expiresAt <= Date.now()) return null;
    return draft;
  }
  async snapshot(admin: string): Promise<AdminFigures> {
    await this.refresh(); const draft = await this.readDraft();
    return { revision: this.state.revision, usedBytes: this.state.usedBytes, limits: FIGURE_UPLOAD_LIMITS,
      currencies: currencies.map(c => ({ symbol: c.symbol, decimals: c.decimals })),
      draft: draft?.owner === admin ? { ...draft.view, previewDataUrl: `data:image/png;base64,${draft.pngBase64}` } : null,
      published: this.state.entries.map(e => {
        const f = e.registration;
        return { id: f.id, variant: f.variant, name: f.name, description: f.description, purchasable: f.purchasable, seekerExclusive: f.seekerExclusive,
          imageUrl: f.resources!.png, portrait: { ...f.portrait!, url: f.resources!.png }, animation: { ...f.animation, contract: 1, url: f.resources!.rive },
          requestId: e.requestId, publishedAt: e.publishedAt };
      }),
    };
  }
  async prepare(admin: string, read: () => Promise<Record<string, unknown>>): Promise<AdminFigures> {
    return this.lock(async owner => {
      await this.refresh(); const input = await read();
      if (typeof input.requestId !== 'string' || !REQUEST.test(input.requestId)) throw new ShopError('Invalid upload request. Reload the form.');
      if (this.state.entries.some(e => e.requestId === input.requestId)) throw new ShopError('This upload is already published. Reload registrations.', 409);
      if (!isFigureId(input.id) || FIGURES.some(f => f.id === input.id)) throw new ShopError('Figure ID: choose an unused lowercase slug, beginning with a letter, at most 64 characters.');
      const text = (value: unknown, maximum: number, field: string) => {
        if (typeof value !== 'string' || !value.trim().length || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ShopError(`${field}: enter 1–${maximum} characters.`);
        return value.trim().normalize('NFC');
      };
      const id = input.id, name = text(input.name, 100, 'Name'), description = text(input.description, 2000, 'Description');
      const currency = currencies.find(c => c.symbol === input.currency);
      if (!currency) throw new ShopError('Currency: choose one of the existing store currencies.');
      let amount: string;
      try { amount = decimalToUnits(input.price, currency.decimals, currency.mint ? undefined : BigInt(Number.MAX_SAFE_INTEGER)); }
      catch (error) { throw new ShopError(`Price: ${(error as Error).message}`); }
      const rive = decodeFigureUpload(input.riveBase64, 'rive'), png = decodeFigureUpload(input.pngBase64, 'png');
      const riveSha256 = sha(rive), pngSha256 = sha(png), price = unitsToDecimal(amount, currency.decimals);
      const fingerprint = sha(JSON.stringify({ id, name, description, currency: currency.symbol, amount, riveSha256, pngSha256 }));
      const previous = await this.readDraft();
      if (previous) {
        if (previous.owner === admin && previous.view.requestId === input.requestId && previous.fingerprint === fingerprint) return this.snapshot(admin);
        throw new ShopError('An upload is already awaiting publication. Review or discard it before uploading another.', 409);
      }
      if (this.state.usedBytes + rive.length + png.length + 16384 > FIGURE_UPLOAD_LIMITS.storage) throw new ShopError('Figure storage is full. Contact the operator before adding more files.', 409);
      if (Math.max(...FIGURES.map(f => f.variant)) >= 255) throw new ShopError('All compatible fighter variants are allocated.', 409);
      const count = Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],120) end;return n", { keys: [`${this.key}:upload-rate:${Math.floor(Date.now()/60000)}`], arguments: [] }));
      if (count > 6) throw new ShopError('Too many uploads. Wait a minute and try again.', 429);
      validateFigurePng(png); await this.validateRive(rive);
      const view: FigureDraft = { requestId: input.requestId, id, name, description, currency: currency.symbol, price, createdAt: Date.now(),
        expiresAt: Date.now() + FIGURE_UPLOAD_LIMITS.draftSeconds * 1000, riveBytes: rive.length, pngBytes: png.length, riveSha256, pngSha256,
        previewDataUrl: '' };
      const draft: Draft = { owner: admin, view, fingerprint, riveBase64: rive.toString('base64'), pngBase64: png.toString('base64'),
        payment: currency.mint ? { tokenPayment: { mint: currency.mint, symbol: currency.symbol, decimals: currency.decimals, amount } } : { priceLamports: amount } };
      if (this.durable) await this.durable.saveDraft(owner, JSON.stringify(draft));
      else if (Number(await this.redis.eval(DRAFT_SAVE, { keys: [this.lockKey, this.draftKey], arguments: [owner, JSON.stringify(draft), String(FIGURE_UPLOAD_LIMITS.draftSeconds)] })) !== 1) throw new ShopError('Upload timed out. Reload before retrying.', 409);
      return this.snapshot(admin);
    });
  }
  async discard(admin: string, requestId: unknown) {
    return this.lock(async owner => {
      const draft = await this.readDraft();
      if (draft && (draft.owner !== admin || draft.view.requestId !== requestId)) throw new ShopError('This draft changed. Reload before discarding it.', 409);
      if (draft) {
        if (this.durable) await this.durable.discardDraft(owner, draft.fingerprint);
        else await this.redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", { keys: [this.draftKey], arguments: [JSON.stringify(draft)] });
      }
      return this.snapshot(admin);
    });
  }
  async publish(admin: string, input: Record<string, unknown>): Promise<AdminFigures> {
    return this.lock(async owner => {
      await this.refresh();
      if (typeof input.requestId !== 'string' || !REQUEST.test(input.requestId)) throw new ShopError('Invalid publication request.');
      if (this.state.entries.some(e => e.requestId === input.requestId)) return this.snapshot(admin);
      if (input.expectedRevision !== this.state.revision) throw new ShopError('Figure registrations changed. Reload before publishing.', 409);
      const draft = await this.readDraft();
      if (!draft || draft.owner !== admin || draft.view.requestId !== input.requestId) throw new ShopError('Upload draft expired or changed. Reload before publishing.', 409);
      if (FIGURES.some(f => f.id === draft.view.id)) throw new ShopError('This figure ID is already registered.', 409);
      const view = draft.view, asset = (hash: string, ext: string) => `${this.assetOrigin}/shop/figure-assets/${hash}.${ext}`;
      const pngUrl = asset(view.pngSha256, 'png');
      const metadata = Buffer.from(JSON.stringify({ name: view.name, symbol: 'RIPSY', description: view.description, image: pngUrl,
        external_url: 'https://www.ripsy.fun', attributes: [{ trait_type: 'Figure', value: view.id }],
        properties: { files: [{ uri: pngUrl, type: 'image/png' }], category: 'image' } }));
      const metadataHash = sha(metadata);
      const registration: Registration = { id: view.id, variant: Math.max(...FIGURES.map(f => f.variant)) + 1, name: view.name, description: view.description,
        purchasable: true, seekerExclusive: false, ...draft.payment, animation: { sha256: view.riveSha256, bytes: view.riveBytes },
        portrait: { sha256: view.pngSha256, bytes: view.pngBytes }, resources: { rive: asset(view.riveSha256, 'riv'), png: pngUrl, metadata: asset(metadataHash, 'json') } };
      validateRegistrations([...FIGURES, registration]);
      const usedBytes = this.state.usedBytes + view.riveBytes + view.pngBytes + metadata.length;
      if (usedBytes > FIGURE_UPLOAD_LIMITS.storage) throw new ShopError('Figure storage is full.', 409);
      const entry: Published = { registration, requestId: view.requestId, publishedAt: Date.now(), publishedBy: admin, metadata: { sha256: metadataHash, bytes: metadata.length } };
      const next: State = { schema: 1, revision: this.state.revision + 1, usedBytes, entries: [...this.state.entries, entry] };
      if (this.durable) {
        await this.durable.publishFigures(owner, this.state.revision, draft.fingerprint, JSON.stringify(next), [
          { filename: `${view.riveSha256}.riv`, bytes: Buffer.from(draft.riveBase64, 'base64') },
          { filename: `${view.pngSha256}.png`, bytes: Buffer.from(draft.pngBase64, 'base64') },
          { filename: `${metadataHash}.json`, bytes: metadata },
        ]);
        return this.snapshot(admin);
      }
      const result = Number(await this.redis.eval(FIGURE_PUBLISH_CAS, { keys: [this.key, this.draftKey, this.lockKey,
        this.blob(`${view.riveSha256}.riv`), this.blob(`${view.pngSha256}.png`), this.blob(`${metadataHash}.json`)],
        arguments: [owner, String(this.state.revision), view.requestId, draft.fingerprint, JSON.stringify(next), metadata.toString('base64')] }));
      if (result !== 1) throw new ShopError('Publication did not commit. Reload the saved draft and try again; do not upload another copy.', 409);
      return this.snapshot(admin);
    });
  }
  async resource(filename: string): Promise<{ bytes: Buffer; type: string; hash: string }> {
    if (!/^[a-f0-9]{64}\.(riv|png|json)$/.test(filename)) throw new ShopError('Figure resource not found.', 404);
    await this.refresh(); const [hash, ext] = filename.split('.');
    const entry = this.state.entries.find(e => ext === 'riv' ? e.registration.animation.sha256 === hash : ext === 'png' ? e.registration.portrait!.sha256 === hash : e.metadata.sha256 === hash);
    if (!entry) throw new ShopError('Figure resource not found.', 404);
    const value = this.durable ? await this.durable.asset(filename) : await this.redis.get(this.blob(filename));
    if (!value) throw new ShopError('Figure resource temporarily unavailable.', 503);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'base64'), size = ext === 'riv' ? entry.registration.animation.bytes : ext === 'png' ? entry.registration.portrait!.bytes : entry.metadata.bytes;
    if (bytes.length !== size || sha(bytes) !== hash) throw new ShopError('Figure resource verification failed.', 503);
    return { bytes, hash: hash!, type: ext === 'png' ? 'image/png' : ext === 'json' ? 'application/json; charset=utf-8' : 'application/octet-stream' };
  }
  private blob(filename: string) { return `${this.key}:asset:${filename}`; }
  private async lock<T>(action: (owner: string) => Promise<T>): Promise<T> {
    if (this.durable) return this.durable.withFigures(action);
    const owner = randomUUID();
    if (!await this.redis.set(this.lockKey, owner, { NX: true, EX: 60 })) throw new ShopError('Another figure upload is processing. Wait and reload.', 409);
    try { return await action(owner); }
    finally { await this.redis.eval(RELEASE_LOCK, { keys: [this.lockKey], arguments: [owner] }); }
  }
}
