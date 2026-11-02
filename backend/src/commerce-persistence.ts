/** Durable commerce operations, independent of Redis commands and Lua scripts.
 * Runtime authentication, rate limits, games and caches remain in Redis.
 */
export type OrderKind = 'shop' | 'pack';
export function canonicalCommerce(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCommerce).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalCommerce(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export interface OrderWriter {
  read(): Promise<string | null>;
  save(value: string, pending: boolean, retentionSeconds?: number): Promise<void>;
}
export interface CommercePersistence {
  setting(name: 'prices' | 'pack' | 'registry'): Promise<string | null>;
  saveSetting(name: 'prices' | 'pack', revision: number, value: string): Promise<boolean>;
  order(kind: OrderKind, id: string): Promise<string | null>;
  withOrder<T>(kind: OrderKind, id: string, action: (writer: OrderWriter) => Promise<T>): Promise<T>;
  duePacks(now: number): Promise<string[]>;
  withFigures<T>(action: (token: string) => Promise<T>): Promise<T>;
  draft(): Promise<string | null>;
  saveDraft(token: string, value: string): Promise<void>;
  discardDraft(token: string, fingerprint: string): Promise<void>;
  publishFigures(token: string, revision: number, fingerprint: string, state: string, assets: { filename: string; bytes: Buffer }[]): Promise<void>;
  asset(filename: string): Promise<Buffer>;
}
