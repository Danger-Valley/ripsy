import {
  isFigureId,
  figurePaymentPrice,
  validateSolFunding,
  type SolFunding,
  type FigureId,
  type TokenPayment,
} from "@rps/core/shop";

export const PACK_PROGRAM_ID = "43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ";
export const PACK_PAYMENT: TokenPayment = {
  mint: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3",
  symbol: "SKR",
  decimals: 6,
  amount: "1099000000",
};
export const PACK_WEIGHT_TOTAL = 1_000_000;
export interface PackDrop {
  figureId: FigureId;
  weight: number;
}
export interface PackCatalog {
  name: string;
  available: boolean;
  version: number;
  payment: TokenPayment;
  drops: PackDrop[];
}
export const INITIAL_PACK: PackCatalog = {
  name: "Fighter pack",
  available: false,
  version: 1,
  payment: PACK_PAYMENT,
  drops: [
    { figureId: "jup", weight: 500_000 },
    { figureId: "bonk", weight: 500_000 },
  ],
};
export type PackStatus =
  | "prepared"
  | "submitted"
  | "waiting-result"
  | "ready-to-claim"
  | "confirmed"
  | "failed"
  | "expired";
export interface PackOrder {
  solFunding?: SolFunding;
  id: string;
  buyer: string;
  cluster: "mainnet-beta";
  transaction: string;
  receipt: string;
  asset: string;
  edition: string;
  version: number;
  payment: TokenPayment;
  drops: PackDrop[];
  status: PackStatus;
  signature: string | null;
  result: FigureId | null;
  randomness: string | null;
  networkFeeLamports: string;
  lastValidBlockHeight: number;
  createdAt: number;
}
export function isTerminalPack(order: PackOrder) {
  return ["confirmed", "failed", "expired"].includes(order.status);
}
export const packPrice = (payment: TokenPayment) =>
  figurePaymentPrice(
    { priceLamports: "0", tokenPayment: payment },
    "mainnet-beta"
  );
export function validatePackDrops(drops: PackDrop[]): void {
  if (
    !Array.isArray(drops) ||
    !drops.length ||
    drops.length > 32 ||
    new Set(drops.map((drop) => drop?.figureId)).size !== drops.length ||
    drops.some(
      (drop) =>
        !isFigureId(drop?.figureId) || drop.figureId === 'fig1' || drop.figureId === 'fig2' ||
        !Number.isSafeInteger(drop?.weight) ||
        drop.weight <= 0
    ) ||
    drops.reduce((sum, drop) => sum + drop.weight, 0) !== PACK_WEIGHT_TOTAL
  )
    throw new Error("Invalid pack chances");
}
const isAddress = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
export function parsePackCatalog(value: unknown): PackCatalog {
  const c = value as PackCatalog;
  if (
    !c ||
    typeof c.name !== "string" ||
    typeof c.available !== "boolean" ||
    !Number.isSafeInteger(c.version) ||
    c.version < 1 ||
    c.payment?.mint !== PACK_PAYMENT.mint ||
    c.payment?.symbol !== "SKR" ||
    c.payment?.decimals !== 6 ||
    !/^[1-9]\d{0,15}$/.test(c.payment?.amount)
  )
    throw new Error("Invalid pack catalog");
  validatePackDrops(c.drops);
  return c;
}
export function parsePackOrder(value: unknown): PackOrder {
  const o = value as PackOrder;
  if (
    !o ||
    !/^[a-f0-9]{64}$/.test(o.id) ||
    ![o.buyer, o.receipt, o.asset, o.edition].every(isAddress) ||
    o.cluster !== "mainnet-beta" ||
    typeof o.transaction !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(o.transaction) ||
    o.transaction.length > 1644 ||
    ![
      "prepared",
      "submitted",
      "waiting-result",
      "ready-to-claim",
      "confirmed",
      "failed",
      "expired",
    ].includes(o.status) ||
    !(
      o.signature === null ||
      (typeof o.signature === "string" &&
        /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(o.signature))
    ) ||
    !(
      o.randomness === null ||
      (typeof o.randomness === "string" && /^[a-f0-9]{64}$/.test(o.randomness))
    ) ||
    !/^\d{1,16}$/.test(o.networkFeeLamports) ||
    !Number.isSafeInteger(o.lastValidBlockHeight) ||
    o.lastValidBlockHeight < 1 ||
    !Number.isSafeInteger(o.createdAt) ||
    o.createdAt < 0
  )
    throw new Error("Invalid pack order");
  parsePackCatalog({
    name: "Fighter pack",
    available: true,
    version: o.version,
    payment: o.payment,
    drops: o.drops,
  });
  const resolved = ["ready-to-claim", "confirmed"].includes(o.status);
  if (
    resolved
      ? !o.randomness || !o.drops.some((d) => d.figureId === o.result)
      : o.result !== null || o.randomness !== null
  )
    throw new Error("Invalid pack result");
  validateSolFunding(o.solFunding, o.payment);
  return o;
}
