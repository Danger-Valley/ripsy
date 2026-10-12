import { publicKey } from '@metaplex-foundation/umi';
import { DEFAULT_SOLANA_MOBILE_STORE_URL, MAX_FIGURE_PURCHASE_QUANTITY, isSafeShopExternalUrl, type ShopCatalog, type ShopCluster } from '@rps/core/shop';
import { FIGURES, FIGURE_TOKEN_PAYMENTS } from './figure-registry.js';

export interface ShopConfig {
  enabled: boolean;
  cluster: ShopCluster;
  rpcUrl: string;
  seekerRpcUrl: string;
  treasury: string | null;
  collection: string | null;
  authoritySecret: string | undefined;
  publicOrigin: string;
  solanaMobileStoreUrl: string;
  prices: Record<string, string | null>;
  jupiterApiKey?: string;
}

export function loadShopConfig(env: NodeJS.ProcessEnv): ShopConfig {
  const cluster = env.SHOP_SOLANA_CLUSTER ?? 'devnet';
  if (cluster !== 'devnet' && cluster !== 'mainnet-beta') throw new Error('Invalid SHOP_SOLANA_CLUSTER');
  const enabled = env.SHOP_ENABLED === 'true';
  const treasury = env.SHOP_TREASURY_ADDRESS ? String(publicKey(env.SHOP_TREASURY_ADDRESS)) : null;
  const collection = env.SHOP_COLLECTION_ADDRESS ? String(publicKey(env.SHOP_COLLECTION_ADDRESS)) : null;
  const publicOrigin = (env.SHOP_PUBLIC_ORIGIN ?? 'https://www.ripsy.fun').replace(/\/$/, '');
  if (new URL(publicOrigin).protocol !== 'https:' && !publicOrigin.startsWith('http://localhost:')) throw new Error('SHOP_PUBLIC_ORIGIN must use HTTPS');
  const solanaMobileStoreUrl = env.SHOP_SOLANA_MOBILE_STORE_URL?.trim() || DEFAULT_SOLANA_MOBILE_STORE_URL;
  if (!isSafeShopExternalUrl(solanaMobileStoreUrl)) throw new Error('SHOP_SOLANA_MOBILE_STORE_URL must be an HTTPS URL without credentials');
  // RIPSY 001 is the permanent free starter and must never become purchasable
  // through a stale environment variable.
  // Seeker fighter now uses its registered SKR price. Never reinterpret the
  // obsolete SHOP_FIG2_PRICE_LAMPORTS environment value as a token amount.
  const prices = { ...Object.fromEntries(FIGURES.map(f => [f.id, readPrice(f.priceLamports)])), fig1: null };
  if (enabled && (!treasury || !collection || !env.SHOP_MINT_AUTHORITY_SECRET)) throw new Error('Shop signing configuration is incomplete');
  if (enabled && cluster === 'mainnet-beta' && !env.SHOP_SOLANA_RPC_URL) throw new Error('Set a production SHOP_SOLANA_RPC_URL');
  return {
    enabled, cluster, treasury, collection, prices, publicOrigin, solanaMobileStoreUrl,
    rpcUrl: env.SHOP_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    seekerRpcUrl: env.SOLANA_RPC_URL ?? (cluster === 'mainnet-beta' && env.SHOP_SOLANA_RPC_URL ? env.SHOP_SOLANA_RPC_URL : 'https://api.mainnet-beta.solana.com'),
    authoritySecret: env.SHOP_MINT_AUTHORITY_SECRET,
    jupiterApiKey: env.JUPITER_API_KEY?.trim() || undefined,
  };
}

function readPrice(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^[1-9]\d{0,15}$/.test(value) || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Shop prices must be positive integer lamports');
  return value;
}

export function shopCatalog(config: ShopConfig): ShopCatalog {
  return {
    cluster: config.cluster, treasury: config.treasury, collection: config.collection,
    maxFigureQuantity: MAX_FIGURE_PURCHASE_QUANTITY,
    solanaMobileStoreUrl: config.solanaMobileStoreUrl,
    figures: FIGURES.filter(figure => figure.purchasable).map(figure => ({
      id: figure.id, name: figure.name, variant: figure.variant,
      description: figure.description, seekerExclusive: figure.seekerExclusive,
      imageUrl: `${config.publicOrigin}/figures/${figure.id}.png`,
      priceLamports: FIGURE_TOKEN_PAYMENTS[figure.id] ? '0' : config.prices[figure.id] ?? null,
      ...(FIGURE_TOKEN_PAYMENTS[figure.id] ? { tokenPayment: FIGURE_TOKEN_PAYMENTS[figure.id] } : {}),
      available: config.enabled && (FIGURE_TOKEN_PAYMENTS[figure.id] ? config.cluster === 'mainnet-beta' : Boolean(config.prices[figure.id])),
    })),
  };
}
