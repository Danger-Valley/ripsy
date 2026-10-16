import { PACK_PAYMENT, parsePackCatalog, type PackCatalog } from '@rps/core/packs';
import { decimalToUnits, type AdminPackSettings } from '@rps/core/shop-admin';
import type { ShopRedis } from './shop-service.js';
import { ShopError } from './shop-error.js';
import { FIGURES } from './figure-registry.js';

export const DEFAULT_BACKEND_PACK: PackCatalog = {
  name: 'Fighter pack', engine: 'backend', available: true, version: 1,
  payment: { ...PACK_PAYMENT, amount: '10000000' },
  drops: [{ figureId: 'jup', weight: 400000 }, { figureId: 'bonk', weight: 400000 }, { figureId: 'ore', weight: 200000 }],
};
export const PACK_SETTINGS_CAS = `-- backend-pack-settings-cas
local old = redis.call('GET', KEYS[1]); local revision = 1
if old then revision = cjson.decode(old).catalog.version end
if revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2]); return 1`;

/** One durable snapshot and audit per save. Never reinterpret existing orders. */
export class BackendPackSettingsService {
  private key: string;
  constructor(private redis: ShopRedis, prefix = 'ripsy', readonly globalEnabled = true) { this.key = `${prefix}:shop:admin:backend-pack`; }
  async get(): Promise<AdminPackSettings> {
    const raw = await this.redis.get(this.key);
    const value: AdminPackSettings = raw ? JSON.parse(raw) : { catalog: structuredClone(DEFAULT_BACKEND_PACK), audit: [] };
    parsePackCatalog(value.catalog);
    if (value.catalog.engine !== 'backend') throw new ShopError('Pack settings are unavailable.', 503);
    return value;
  }
  async catalog(enabled: boolean) {
    const { catalog } = await this.get();
    return { ...catalog, available: enabled && catalog.available };
  }
  async save(admin: string, input: Record<string, unknown>): Promise<AdminPackSettings> {
    if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1 || Number(input.expectedVersion) >= 0xffffffff
      || typeof input.available !== 'boolean') throw new ShopError('Invalid pack settings. Reload before saving.');
    let amount: string;
    try { amount = decimalToUnits(input.price, 6, 9_999_999_999_999_999n); }
    catch (error) { throw new ShopError((error as Error).message); }
    let catalog: PackCatalog;
    try { catalog = parsePackCatalog({ ...DEFAULT_BACKEND_PACK, version: Number(input.expectedVersion) + 1,
      available: input.available, payment: { ...PACK_PAYMENT, amount }, drops: input.drops }); }
    catch { throw new ShopError('Enter valid fighter chances totaling exactly 100%.'); }
    if (catalog.drops.some(drop => !FIGURES.some(f => f.id === drop.figureId && f.purchasable && !f.seekerExclusive)))
      throw new ShopError('Only available, unrestricted shop fighters can be included in packs.');
    const current = await this.get();
    if (current.catalog.version !== input.expectedVersion) throw new ShopError('Pack settings changed in another session. Reload before saving.', 409);
    const next: AdminPackSettings = { catalog,
      audit: [{ at: Date.now(), address: admin, before: current.catalog, after: catalog }, ...current.audit].slice(0, 200) };
    if (Number(await this.redis.eval(PACK_SETTINGS_CAS, { keys: [this.key], arguments: [String(input.expectedVersion), JSON.stringify(next)] })) !== 1)
      throw new ShopError('Pack settings changed in another session. Reload before saving.', 409);
    return next;
  }
}
