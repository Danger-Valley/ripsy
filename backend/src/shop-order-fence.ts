import type { ShopRedis } from './shop-service.js';
import { ShopError } from './shop-error.js';

/** A slow quote must never overwrite a newer order after its Redis lease expires. */
export async function writePreparedOrder(redis: ShopRedis, lock: string, token: string, key: string, value: string, ttl: number, pending?: { key: string; id: string }) {
  const saved = await redis.eval(`-- PREPARED_ORDER_FENCE
    if redis.call('GET',KEYS[1]) ~= ARGV[1] or redis.call('EXISTS',KEYS[2]) == 1 then return 0 end
    if tonumber(ARGV[3]) > 0 then redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]) else redis.call('SET',KEYS[2],ARGV[2]) end
    if KEYS[3] then redis.call('ZADD',KEYS[3],ARGV[4],ARGV[5]) end
    return 1`, { keys: [lock, key, ...(pending ? [pending.key] : [])], arguments: [token, value, String(ttl), String(Date.now() + 15_000), pending?.id ?? ''] });
  if (Number(saved) !== 1) throw new ShopError('Purchase is updating. Check purchase status before trying again.', 409);
}
