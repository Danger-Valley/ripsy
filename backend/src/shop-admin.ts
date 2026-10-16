import { createHash, randomUUID } from 'node:crypto';
import { decimalToUnits, type AdminPublication, type AdminSnapshot, type AdminPackPriceDraft } from '@rps/core/shop-admin';
import type { ShopRedis } from './shop-service.js';
import type { ShopConfig } from './shop-config.js';
import type { ShopPricingService } from './shop-pricing.js';
import { parseAdminPackDraft, type PackAdminChain } from './pack-admin-chain.js';
import { ShopError } from './shop-error.js';
import type { BackendPackSettingsService } from './backend-pack-settings.js';
import type { ShopUsdRatesService } from './shop-usd-rates.js';

interface Stored { job: AdminPublication; signed?: string }
export class ShopAdminService {
  constructor(private redis: ShopRedis, private config: ShopConfig, private prices: ShopPricingService, private chain: PackAdminChain, private prefix = 'ripsy', private usd?: ShopUsdRatesService, private backendPacks?: BackendPackSettingsService) {}
  async usdRates() {
    return this.usd ? this.usd.get() : { source: 'Jupiter', fetchedAt: null, expiresAt: Date.now(), rates: {}, error: 'USD rates are unavailable.' };
  }
  async snapshot(): Promise<AdminSnapshot> {
    if (this.backendPacks) {
      const settings = await this.backendPacks.get();
      return { cluster: this.config.cluster, prices: await this.prices.get(), pack: { ...settings.catalog, available: settings.catalog.available && this.backendPacks.globalEnabled },
        packError: null, packPriceRevision: String(settings.catalog.version), backendPack: settings };
    }
    let pack: AdminSnapshot['pack'] = null; let packError: string | null = null;
    try { pack = await this.chain.catalog(); } catch (error) { packError = error instanceof ShopError ? error.message : 'Pack state is temporarily unavailable. Retry before editing.'; }
    return { cluster: this.config.cluster, prices: await this.prices.get(), pack, packError,
      packPriceRevision: (pack as { priceRevision?: string } | null)?.priceRevision ?? '0' };
  }
  async prepare(admin: string, input: Record<string, unknown>, kind: 'edition' | 'price' = 'edition') {
    if (this.backendPacks) throw new ShopError('Pack settings are now saved on the server. Reload the admin page.', 409);
    if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.requestId)) throw new ShopError('Invalid publication request ID.');
    let draft: AdminPackPriceDraft | null = null;
    if (kind === 'price') {
      if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1 || Number(input.expectedVersion) > 0xffffffff
        || typeof input.expectedPrice !== 'string' || !/^[1-9]\d{0,15}$/.test(input.expectedPrice)
        || typeof input.expectedRevision !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(input.expectedRevision)
        || BigInt(input.expectedRevision) >= 18_446_744_073_709_551_615n || typeof input.price !== 'string') throw new ShopError('Invalid pack price update.');
      draft = { expectedVersion: Number(input.expectedVersion), expectedPrice: input.expectedPrice, expectedRevision: input.expectedRevision, price: input.price };
      try { decimalToUnits(draft.price, 6, 9_999_999_999_999_999n); }
      catch (error) { throw new ShopError((error as Error).message); }
    }
    const catalog = kind === 'edition' ? parseAdminPackDraft(input) : null;
    const id = createHash('sha256').update(`${admin}:${input.requestId}`).digest('hex');
    return this.lock(id, async () => {
      const raw = await this.redis.get(this.key(id));
      if (raw) {
        const saved = JSON.parse(raw) as Stored;
        if (saved.job.buyer !== admin || (saved.job.kind ?? 'edition') !== kind
          || (catalog ? JSON.stringify(saved.job.catalog) !== JSON.stringify(catalog)
            : saved.job.priceUpdate?.expectedPrice !== draft!.expectedPrice || saved.job.priceUpdate?.expectedRevision !== draft!.expectedRevision
              || saved.job.catalog.version !== draft!.expectedVersion || saved.job.catalog.payment.amount !== decimalToUnits(draft!.price, 6, 9_999_999_999_999_999n))) throw new ShopError('Request already used for another update.', 409);
        return this.refresh(saved);
      }
      const count = Number(await this.redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n", { keys: [`${this.prefix}:shop:admin:publish-rate:${Math.floor(Date.now() / 60000)}`], arguments: [] }));
      if (count > 6) throw new ShopError('Too many publication requests. Wait a minute.', 429);
      const prepared = catalog ? { ...await this.chain.prepare(catalog), catalog } : await this.chain.preparePrice(draft!);
      const job: AdminPublication = { ...prepared, kind, id, buyer: admin, cluster: 'mainnet-beta', createdAt: Date.now(), status: 'prepared', signature: null };
      await this.write({ job }); return job;
    });
  }
  async get(admin: string, id: string) {
    if (this.backendPacks) throw new ShopError('Onchain pack administration has been retired. Reload the admin page.', 409);
    return this.lock(id, async () => this.refresh(await this.read(admin, id)));
  }
  async submit(admin: string, id: string, signed: unknown) {
    if (this.backendPacks) throw new ShopError('Onchain pack administration has been retired. Reload the admin page.', 409);
    if (typeof signed !== 'string') throw new ShopError('A signed publication is required.');
    return this.lock(id, async () => {
      const stored = await this.read(admin, id); await this.refresh(stored);
      if (!['prepared', 'submitted'].includes(stored.job.status)) return stored.job;
      const signature = this.chain.validateSigned(stored.job, signed);
      if (stored.signed && stored.signed !== signed) throw new ShopError('A different signed publication is already pending.', 409);
      stored.signed = signed; stored.job.signature = signature; stored.job.status = 'submitted';
      await this.write(stored);
      await this.chain.send(signed).catch(() => undefined);
      return this.refresh(stored);
    });
  }
  async savePack(admin: string, input: Record<string, unknown>) {
    if (!this.backendPacks) throw new ShopError('Backend pack administration is unavailable.', 503);
    return this.backendPacks.save(admin, input);
  }
  private async refresh(stored: Stored) {
    if (!['prepared', 'submitted'].includes(stored.job.status)) return stored.job;
    stored.job.status = await this.chain.status(stored.job);
    await this.write(stored);
    if (stored.job.status === 'submitted' && stored.signed) await this.chain.send(stored.signed).catch(() => undefined);
    return stored.job;
  }
  private key(id: string) { return `${this.prefix}:shop:admin:publication:${id}`; }
  private async read(admin: string, id: string) {
    const raw = await this.redis.get(this.key(id));
    if (!raw) throw new ShopError('Publication not found.', 404);
    const stored = JSON.parse(raw) as Stored;
    if (stored.job.buyer !== admin) throw new ShopError('Publication not found.', 404);
    return stored;
  }
  private async write(stored: Stored) { await this.redis.set(this.key(stored.job.id), JSON.stringify(stored), { EX: 90 * 86400 }); }
  private async lock<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ShopError('Publication not found.', 404);
    const key = `${this.key(id)}:lock`; const owner = randomUUID();
    if (!await this.redis.set(key, owner, { NX: true, EX: 120 })) throw new ShopError('Publication is processing. Check its status shortly.', 409);
    try { return await action(); } finally { await this.redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", { keys: [key], arguments: [owner] }); }
  }
}
