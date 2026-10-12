import { parseFigureInventory, parseMintOrder, parseSeekerChallenge, parseShopCatalog, parseWalletChallenge, parseTokenShortfall, type TokenShortfall, type FigureId, type SeekerProof, type WalletProof } from '@rps/core/shop';
import { parsePackCatalog, parsePackOrder } from '@rps/core/packs';
import { parseFigureManifest } from '@rps/core/figure-manifest';

export class ShopRequestError extends Error {
  constructor(message: string, public recovery: TokenShortfall | null, public status?: number) { super(message); }
}
export class ShopClient {
  // Browser fetch needs its Window/global receiver, not this ShopClient instance.
  constructor(private baseUrl: string, private token: string, private fetcher: typeof fetch = (...args) => globalThis.fetch(...args)) {}

  async catalog() { return parseShopCatalog(await this.request('/shop/catalog?catalogVersion=4')); }
  async figures() { return parseFigureManifest(await this.request('/shop/figures')); }
  async packCatalog() { return parsePackCatalog(await this.request('/shop/packs/catalog')); }
  async createPack(buyer: string, idempotencyKey: string, paymentMode?: 'sol') { return parsePackOrder(await this.request('/shop/packs/orders', { buyer, idempotencyKey, ...(paymentMode ? { paymentMode } : {}) })); }
  async getPack(id: string) { return parsePackOrder(await this.request(`/shop/packs/orders/${encodeURIComponent(id)}`)); }
  async submitPack(id: string, transaction: string) { return parsePackOrder(await this.request(`/shop/packs/orders/${encodeURIComponent(id)}/submit`, { transaction })); }
  async seekerChallenge() { return parseSeekerChallenge(await this.request('/shop/seeker/challenge', {})); }
  async verifySeeker(proof: SeekerProof) { await this.request('/shop/seeker/verify', proof); }
  async walletChallenge() { return parseWalletChallenge(await this.request('/shop/wallet/challenge', {})); }
  async verifyWallet(proof: WalletProof) { await this.request('/shop/wallet/verify', proof); }
  async clearWallet() { await this.request('/shop/wallet', undefined, 'DELETE'); }
  async inventory() { return parseFigureInventory(await this.request('/shop/inventory')); }
  async saveLoadout(slots: Array<string | null>) {
    return parseFigureInventory(await this.request('/shop/loadout', { slots }, 'PUT'));
  }
  async create(figureId: FigureId, buyer: string, idempotencyKey: string, paymentMode?: 'sol') {
    return parseMintOrder(await this.request('/shop/orders', { figureId, buyer, idempotencyKey, ...(paymentMode ? { paymentMode } : {}) }));
  }
  async get(id: string) { return parseMintOrder(await this.request(`/shop/orders/${encodeURIComponent(id)}`)); }
  async submit(id: string, transaction: string) {
    return parseMintOrder(await this.request(`/shop/orders/${encodeURIComponent(id)}/submit`, { transaction }));
  }

  private async request(path: string, body?: unknown, method?: 'POST' | 'PUT' | 'DELETE') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'), signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result: unknown = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Could not reach the shop. Try again.';
        throw new ShopRequestError(message, result && typeof result === 'object' && 'recovery' in result ? parseTokenShortfall(result.recovery) : null, response.status);
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('The shop took too long to respond. Check purchase status before trying again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
}
