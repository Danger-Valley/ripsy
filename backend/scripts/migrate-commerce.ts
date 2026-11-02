import { createClient } from 'redis';
import { createFirebaseCommerce } from '../src/firebase-commerce.js';
import { migrateCommerce } from '../src/commerce-migration.js';
import { loadShopConfig } from '../src/shop-config.js';

// Run only in the production operator/container process. Do not source/copy an
// entire local .env, print receipts, or expose private Redis on a public port.
const apply = process.argv.includes('--apply');
const prefix = process.env.RIPSY_REDIS_PREFIX ?? 'ripsy';
if (!process.env.REDIS_URL) throw new Error('Explicit source REDIS_URL is required');
const store = await createFirebaseCommerce({ ...process.env, COMMERCE_STORAGE: 'firebase' }, prefix, false);
if (!store) throw new Error('Missing target');
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => undefined);
await redis.connect();
try {
  const report = await migrateCommerce(redis, store, loadShopConfig(process.env), { apply, maintenance: process.env.COMMERCE_MAINTENANCE === 'true', sourceMode: process.env.COMMERCE_STORAGE ?? 'redis', archiveBuiltins: process.argv.includes('--archive-builtins') });
  console.log(JSON.stringify(report));
} finally { await redis.close(); await store.db.terminate(); }
