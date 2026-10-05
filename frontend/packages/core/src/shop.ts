/** Shop is deliberately independent of gameplay and its anonymous identity. */
export type ShopCluster = 'devnet' | 'mainnet-beta';
export type FigureId = 'fig1' | 'fig2';
export const FIGURES = [
  { id: 'fig1' as const, name: 'RIPSY 001', variant: 1 as const, description: 'The original RIPSY fighter. Free in every army.', seekerExclusive: false, purchasable: false },
  { id: 'fig2' as const, name: 'Seeker fighter', variant: 2 as const, description: 'A new face for your collection. The same fighting spirit.', seekerExclusive: true, purchasable: true },
];
export const STARTER_FIGURE_ID = 'fig1' as const;
export const FIGURE_SLOTS = 14;
export const DEFAULT_SOLANA_MOBILE_STORE_URL = 'https://store.solanamobile.com/';
export interface ShopFigure {
  id: FigureId;
  name: string;
  variant: 1 | 2;
  description: string;
  imageUrl: string;
  priceLamports: string | null;
  available: boolean;
  seekerExclusive: boolean;
}
export interface ShopCatalog {
  cluster: ShopCluster;
  treasury: string | null;
  collection: string | null;
  /** Optional for rolling compatibility with older backend deployments. */
  solanaMobileStoreUrl?: string;
  figures: ShopFigure[];
}
export type MintStatus = 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'expired';
export interface MintOrder {
  id: string;
  figureId: FigureId;
  buyer: string;
  asset: string;
  cluster: ShopCluster;
  priceLamports: string;
  treasury: string;
  collection: string;
  transaction: string;
  lastValidBlockHeight: number;
  createdAt: number;
  status: MintStatus;
  signature: string | null;
  error: string | null;
  /** Network fee + rent + protocol fees, estimated by simulation, excludes price. */
  networkFeeLamports: string;
}

export interface SeekerChallenge {
  chainId: 'solana:mainnet';
  domain: string;
  expirationTime: string;
  issuedAt: string;
  nonce: string;
  statement: string;
  uri: string;
  version: '1';
}

export interface SeekerProof {
  address: string;
  nonce: string;
  signature: number[];
  signedMessage: number[];
}

export type WalletChallenge = SeekerChallenge;
export type WalletProof = SeekerProof;

export interface OwnedFigureAsset {
  assetId: string;
  figureId: Exclude<FigureId, typeof STARTER_FIGURE_ID>;
  name: string;
  imageUrl: string;
}

/** `null` means the free starter fig1. Every non-null asset may occur once. */
export interface FigureInventory {
  wallet: string;
  assets: OwnedFigureAsset[];
  slots: Array<string | null>;
}

export function isFigureId(value: unknown): value is FigureId {
  return value === 'fig1' || value === 'fig2';
}

export function formatSol(lamports: string): string {
  if (!/^\d+$/.test(lamports)) throw new Error('Invalid SOL amount');
  const padded = lamports.padStart(10, '0');
  const whole = padded.slice(0, -9).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-9).replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} SOL`;
}

/** Presentation only: preserve server errors internally, but do not expose payment internals in the store. */
export function figureStoreMessage(message: string | null | undefined, fallback = 'Could not complete this request. Please try again.'): string {
  if (!message) return fallback;
  // Hardware-store branding is intentional, not payment jargon.
  if (/Solana Mobile store/i.test(message)) return message;
  if (/insufficient|not enough (?:funds|sol)|balance.{0,20}(?:low|small)/i.test(message)) return 'Not enough funds to complete this purchase.';
  if (/(?:genesis token|seed vault|\bSGT\b)/i.test(message)) return 'This figure is only available to eligible Seeker owners. Connect your Seeker wallet and try again.';
  if (/connection (?:was )?(?:cancelled|canceled)/i.test(message)) return 'Connection cancelled.';
  if (/(?:cancelled|canceled|rejected)/i.test(message) && /wallet|signature|transaction/i.test(message)) return 'Approval cancelled. Check purchase status before trying again.';
  if (/mint(?:ing)?.{0,25}(?:not available|unavailable)/i.test(message)) return 'Purchases are not available yet.';
  if (/too many mint/i.test(message)) return 'Too many purchase requests. Wait a minute and try again.';
  if (/signature|wallet proof|signed message/i.test(message)) return 'Could not verify your account. Sign in again and try again.';
  if (/mint|\bNFTs?\b|metaplex|\bcore\b|self[- ]custodial|embedded wallet|blockchain|\bRPC\b|\bDAS\b|lamport|blockhash|transaction|\bsolana\b|\bSOL\b|\bprivy\b|wallet/i.test(message)) return fallback;
  return message;
}

export function figurePrice(lamports: string, cluster: ShopCluster): string {
  return cluster === 'devnet' ? formatSol(lamports).replace(/ SOL$/, ' test credits') : formatSol(lamports);
}

export function solanaExplorer(kind: 'tx' | 'address', value: string, cluster: ShopCluster) {
  return `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
}

export function isTerminalMint(order: MintOrder) {
  return ['confirmed', 'failed', 'expired'].includes(order.status);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid shop response');
  return value as Record<string, unknown>;
}
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const isAddress = (value: unknown): value is string => typeof value === 'string' && addressPattern.test(value);
const isAmount = (value: unknown): value is string => typeof value === 'string' && /^\d{1,16}$/.test(value);
const isCluster = (value: unknown) => value === 'devnet' || value === 'mainnet-beta';

export function isSafeShopExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function parseShopCatalog(value: unknown): ShopCatalog {
  const data = record(value);
  if (!isCluster(data.cluster) || !(data.treasury === null || isAddress(data.treasury))
    || !(data.collection === null || isAddress(data.collection)) || !Array.isArray(data.figures)
    || !(data.solanaMobileStoreUrl === undefined || isSafeShopExternalUrl(data.solanaMobileStoreUrl))) throw new Error('Invalid shop catalog');
  for (const entry of data.figures) {
    const figure = record(entry);
    if (!isFigureId(figure.id) || (figure.variant !== 1 && figure.variant !== 2) || typeof figure.name !== 'string'
      || typeof figure.description !== 'string' || typeof figure.imageUrl !== 'string' || typeof figure.seekerExclusive !== 'boolean'
      || !(figure.priceLamports === null || isAmount(figure.priceLamports)) || typeof figure.available !== 'boolean') throw new Error('Invalid shop figure');
  }
  return data as unknown as ShopCatalog;
}

export function parseSeekerChallenge(value: unknown): SeekerChallenge {
  const data = record(value);
  if (data.chainId !== 'solana:mainnet' || typeof data.domain !== 'string' || typeof data.uri !== 'string'
    || typeof data.issuedAt !== 'string' || typeof data.expirationTime !== 'string'
    || typeof data.statement !== 'string' || data.version !== '1'
    || typeof data.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(data.nonce)) throw new Error('Invalid Seeker verification challenge');
  return data as unknown as SeekerChallenge;
}

export const parseWalletChallenge = parseSeekerChallenge;

export function parseFigureInventory(value: unknown): FigureInventory {
  const data = record(value);
  if (!isAddress(data.wallet) || !Array.isArray(data.assets) || !Array.isArray(data.slots) || data.slots.length !== FIGURE_SLOTS) {
    throw new Error('Invalid figure inventory');
  }
  const assetIds = new Set<string>();
  for (const entry of data.assets) {
    const asset = record(entry);
    if (!isAddress(asset.assetId) || asset.figureId !== 'fig2' || typeof asset.name !== 'string' || typeof asset.imageUrl !== 'string') {
      throw new Error('Invalid figure inventory');
    }
    if (assetIds.has(asset.assetId)) throw new Error('Invalid figure inventory');
    assetIds.add(asset.assetId);
  }
  const equipped = new Set<string>();
  for (const assetId of data.slots) {
    if (assetId === null) continue;
    if (!isAddress(assetId) || !assetIds.has(assetId) || equipped.has(assetId)) throw new Error('Invalid figure loadout');
    equipped.add(assetId);
  }
  return data as unknown as FigureInventory;
}

export function parseMintOrder(value: unknown): MintOrder {
  const data = record(value);
  if (typeof data.id !== 'string' || !/^[a-f0-9]{64}$/.test(data.id) || !isFigureId(data.figureId)
    || !isAddress(data.buyer) || !isAddress(data.asset) || !isAddress(data.treasury) || !isAddress(data.collection)
    || !isCluster(data.cluster) || !isAmount(data.priceLamports) || !isAmount(data.networkFeeLamports)
    || typeof data.transaction !== 'string' || data.transaction.length > 2000
    || !Number.isSafeInteger(data.lastValidBlockHeight) || !Number.isSafeInteger(data.createdAt)
    || !['prepared', 'submitted', 'confirmed', 'failed', 'expired'].includes(String(data.status))
    || !(data.signature === null || (typeof data.signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(data.signature)))
    || !(data.error === null || typeof data.error === 'string')) throw new Error('Invalid mint order');
  return data as unknown as MintOrder;
}
