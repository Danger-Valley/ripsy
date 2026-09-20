/** Shop is deliberately independent of gameplay and its anonymous identity. */
export type ShopCluster = 'devnet' | 'mainnet-beta';
export type FigureId = 'fig1' | 'fig2';
export const FIGURES = [
  { id: 'fig1' as const, name: 'Figure 01', variant: 1 as const, description: 'The original RIPSY fighter. A familiar face, now yours to collect.', seekerExclusive: false },
  { id: 'fig2' as const, name: 'Figure 02', variant: 2 as const, description: 'A new face for your collection. The same fighting spirit.', seekerExclusive: true },
];
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
const isAddress = (value: unknown) => typeof value === 'string' && addressPattern.test(value);
const isAmount = (value: unknown) => typeof value === 'string' && /^\d{1,16}$/.test(value);
const isCluster = (value: unknown) => value === 'devnet' || value === 'mainnet-beta';

export function parseShopCatalog(value: unknown): ShopCatalog {
  const data = record(value);
  if (!isCluster(data.cluster) || !(data.treasury === null || isAddress(data.treasury))
    || !(data.collection === null || isAddress(data.collection)) || !Array.isArray(data.figures)) throw new Error('Invalid shop catalog');
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
