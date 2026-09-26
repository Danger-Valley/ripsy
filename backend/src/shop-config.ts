import { publicKey } from '@metaplex-foundation/umi';
import { FIGURES, type ShopCatalog, type ShopCluster } from '@rps/core/shop';

export interface ShopConfig {
  enabled: boolean;
  cluster: ShopCluster;
  rpcUrl: string;
  seekerRpcUrl: string;
  treasury: string | null;
  collection: string | null;
  authoritySecret: string | undefined;
  publicOrigin: string;
  prices: Record<'fig1' | 'fig2', string | null>;
}

export function loadShopConfig(env: NodeJS.ProcessEnv): ShopConfig {
  const cluster = env.SHOP_SOLANA_CLUSTER ?? 'devnet';
  if (cluster !== 'devnet' && cluster !== 'mainnet-beta') throw new Error('Invalid SHOP_SOLANA_CLUSTER');
  const enabled = env.SHOP_ENABLED === 'true';
  const treasury = env.SHOP_TREASURY_ADDRESS ? String(publicKey(env.SHOP_TREASURY_ADDRESS)) : null;
  const collection = env.SHOP_COLLECTION_ADDRESS ? String(publicKey(env.SHOP_COLLECTION_ADDRESS)) : null;
  const publicOrigin = (env.SHOP_PUBLIC_ORIGIN ?? 'https://www.ripsy.fun').replace(/\/$/, '');
  if (new URL(publicOrigin).protocol !== 'https:' && !publicOrigin.startsWith('http://localhost:')) throw new Error('SHOP_PUBLIC_ORIGIN must use HTTPS');
  // Figure 01 is the permanent free starter and must never become purchasable
  // through a stale environment variable.
  const prices = { fig1: null, fig2: readPrice(env.SHOP_FIG2_PRICE_LAMPORTS) };
  if (enabled && (!treasury || !collection || !env.SHOP_MINT_AUTHORITY_SECRET)) throw new Error('Shop signing configuration is incomplete');
  if (enabled && cluster === 'mainnet-beta' && !env.SHOP_SOLANA_RPC_URL) throw new Error('Set a production SHOP_SOLANA_RPC_URL');
  return {
    enabled, cluster, treasury, collection, prices, publicOrigin,
    rpcUrl: env.SHOP_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    seekerRpcUrl: env.SOLANA_RPC_URL ?? (cluster === 'mainnet-beta' && env.SHOP_SOLANA_RPC_URL ? env.SHOP_SOLANA_RPC_URL : 'https://api.mainnet-beta.solana.com'),
    authoritySecret: env.SHOP_MINT_AUTHORITY_SECRET,
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
    figures: FIGURES.filter(figure => figure.purchasable).map(figure => ({
      ...figure,
      imageUrl: `${config.publicOrigin}/figures/${figure.id}.png`,
      priceLamports: config.prices[figure.id],
      available: config.enabled && config.prices[figure.id] !== null,
    })),
  };
}
