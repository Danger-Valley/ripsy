import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Instruction,
} from "@solana/kit";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNoopSigner,
  keypairIdentity,
  publicKey,
  transactionBuilder,
  type Umi,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import {
  findAssociatedTokenPda,
  createIdempotentAssociatedToken,
  mplToolbox,
  setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import { MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import { FIGURES } from "./figure-registry.js";
import {
  INITIAL_PACK,
  PACK_PAYMENT,
  PACK_PROGRAM_ID,
  parsePackCatalog,
  type PackCatalog,
  type PackOrder,
} from "@rps/core/packs";
import {
  buyPackData,
  decodeConfig,
  decodeEdition,
  decodeReceipt,
  discriminator,
} from "./pack-codec.js";
import { SHOP_TOKEN_PROGRAM } from "./shop-token-payment.js";
import { createShopChain } from "./shop-chain.js";
import type { ShopConfig } from "./shop-config.js";
import { ShopError } from "./shop-error.js";
import { packPricing } from "./pack-pricing.js";

const SYSTEM = "11111111111111111111111111111111";
const VRF = "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz";
const QUEUE = "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh";
const SLOT_HASHES = "SysvarS1otHashes111111111111111111111111111";
const encoder = getAddressEncoder();
async function pda(seeds: Uint8Array[]) {
  return (
    await getProgramDerivedAddress({
      programAddress: address(PACK_PROGRAM_ID),
      seeds,
    })
  )[0];
}
const utf = (s: string) => new TextEncoder().encode(s);
const meta = (value: string, role: AccountRole) => ({
  address: address(value),
  role,
});
// Existing Umi Core/wallet/signature stack is isolated to this adapter boundary.
function umiInstruction(ix: Instruction) {
  return {
    programId: publicKey(ix.programAddress),
    data: new Uint8Array(ix.data ?? []),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: publicKey(a.address),
      isSigner:
        a.role === AccountRole.READONLY_SIGNER ||
        a.role === AccountRole.WRITABLE_SIGNER,
      isWritable:
        a.role === AccountRole.WRITABLE ||
        a.role === AccountRole.WRITABLE_SIGNER,
    })),
  };
}
export interface PackChain {
  catalog(): Promise<PackCatalog>;
  prepare(
    buyer: string,
    nonce: Uint8Array
  ): Promise<
    Omit<
      PackOrder,
      "id" | "status" | "signature" | "createdAt" | "result" | "randomness"
    >
  >;
  validateSigned(order: PackOrder, signed: string): string;
  send(signed: string): Promise<void>;
  status(
    order: PackOrder
  ): Promise<Pick<PackOrder, "status" | "signature" | "result" | "randomness">>;
  prepareClaim(
    order: PackOrder
  ): Promise<{ transaction: string; lastValidBlockHeight: number }>;
  height(): Promise<number>;
}
export function createPackChain(
  config: ShopConfig,
  enabled: boolean,
  runtime?: Umi
): PackChain {
  const umi = (
    runtime ??
    createUmi(config.rpcUrl, {
      commitment: "confirmed",
      fetch: (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
    })
  ).use(mplToolbox());
  if (config.enabled && config.authoritySecret)
    umi.use(
      keypairIdentity(
        umi.eddsa.createKeypairFromSecretKey(
          Uint8Array.from(JSON.parse(config.authoritySecret) as number[])
        )
      )
    );
  const verifier = createShopChain(config, umi);
  async function account(key: string) {
    const a = await umi.rpc.getAccount(publicKey(key), {
      commitment: "confirmed",
    });
    if (!a.exists || a.owner !== publicKey(PACK_PROGRAM_ID))
      throw new ShopError(
        "Pack configuration is not available. No payment was sent.",
        503
      );
    return a.data;
  }
  async function edition(version: number) {
    const n = Buffer.alloc(4);
    n.writeUInt32LE(version);
    const key = await pda([utf("edition"), n]);
    const e = decodeEdition(await account(key));
    if (
      e.version !== version ||
      e.collection !== config.collection ||
      e.treasury !== config.treasury ||
      String(e.mintAuthority) !== String(umi.identity.publicKey)
    )
      throw new ShopError("Pack configuration does not match the store.", 503);
    return { key, e };
  }
  async function catalog() {
    if (!enabled) return structuredClone(INITIAL_PACK);
    if (!config.enabled || config.cluster !== "mainnet-beta")
      throw new ShopError(
        "Packs need the production store configuration.",
        503
      );
    const [genesis, root, program] = await Promise.all([
      umi.rpc.call<string>("getGenesisHash"),
      account(await pda([utf("config")])),
      umi.rpc.getAccount(publicKey(PACK_PROGRAM_ID)),
    ]);
    if (
      genesis !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" ||
      !program.exists ||
      !program.executable
    )
      throw new ShopError("Pack program is not available.", 503);
    const c = decodeConfig(root);
    const { key, e } = await edition(c.version);
    const pricing = await packPricing(umi, key, e.price);
    return parsePackCatalog({
      name: "Fighter pack",
      available: !c.paused,
      version: e.version,
      payment: { ...PACK_PAYMENT, amount: pricing.price.toString() },
      drops: e.drops.map((d) => {
        const figure = FIGURES.find(
          (f) => f.variant === d.variant && !f.seekerExclusive && f.purchasable
        );
        if (
          !figure ||
          d.name !== figure.name ||
          d.uri !== `${config.publicOrigin}/figures/${figure.id}.json`
        )
          throw new ShopError("Update the app for this pack edition.", 409);
        return { figureId: figure.id, weight: d.weight };
      }),
    });
  }
  async function receipt(order: PackOrder) {
    const data = await umi.rpc.getAccount(publicKey(order.receipt), {
      commitment: "confirmed",
    });
    if (!data.exists) return null;
    if (data.owner !== publicKey(PACK_PROGRAM_ID))
      throw new Error("Invalid pack receipt owner");
    const r = decodeReceipt(data.data);
    if (
      r.buyer !== order.buyer ||
      r.edition !== order.edition ||
      r.price !== BigInt(order.payment.amount) ||
      (await pda([
        utf("pack"),
        Uint8Array.from(encoder.encode(address(order.buyer))),
        new Uint8Array(r.nonce),
      ])) !== order.receipt
    )
      throw new Error("Invalid pack receipt");
    return r;
  }
  return {
    catalog,
    async prepare(buyerAddress, nonce) {
      const c = await catalog();
      if (!c.available)
        throw new ShopError("Packs are not available yet.", 503);
      if (buyerAddress === config.treasury)
        throw new ShopError("Use a customer account for this purchase.");
      const buyer = createNoopSigner(publicKey(buyerAddress));
      const e = await edition(c.version);
      const key = await pda([
        utf("pack"),
        Uint8Array.from(encoder.encode(address(buyerAddress))),
        nonce,
      ]);
      const asset = await pda([
        utf("asset"),
        Uint8Array.from(encoder.encode(key)),
      ]);
      const source = findAssociatedTokenPda(umi, {
        mint: publicKey(PACK_PAYMENT.mint),
        owner: buyer.publicKey,
      });
      const escrow = findAssociatedTokenPda(umi, {
        mint: publicKey(PACK_PAYMENT.mint),
        owner: publicKey(key),
      });
      const identity = await pda([utf("identity")]);
      const root = await pda([utf("config")]);
      const roles = [
        meta(buyerAddress, AccountRole.WRITABLE_SIGNER),
        meta(root, 0),
        meta(e.key, 0),
        meta(key, 1),
        meta(PACK_PAYMENT.mint, 0),
        meta(source[0], 1),
        meta(escrow[0], 1),
        meta(identity, 0),
        meta(QUEUE, 1),
        meta(SLOT_HASHES, 0),
        meta(VRF, 0),
        meta(SHOP_TOKEN_PROGRAM, 0),
        meta("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", 0),
        meta(SYSTEM, 0),
        // Old program ignores this extra account; upgraded program requires it.
        meta((await packPricing(umi, e.key, e.e.price)).key, 0),
      ];
      const [blockhash, balance] = await Promise.all([
        umi.rpc.getLatestBlockhash(),
        umi.rpc.getBalance(buyer.publicKey),
      ]);
      const transaction = await transactionBuilder()
        .setVersion(0)
        .setFeePayer(buyer)
        .setBlockhash(blockhash)
        .add(setComputeUnitLimit(umi, { units: 600_000 }))
        .add({
          instruction: umiInstruction({
            programAddress: address(PACK_PROGRAM_ID),
            accounts: roles,
            data: buyPackData(nonce, c.version, c.payment.amount),
          }),
          signers: [buyer],
          bytesCreatedOnChain: 0,
        })
        .buildAndSign(umi);
      const simulation = await umi.rpc.simulateTransaction(transaction, {
        verifySignatures: false,
        accounts: [buyer.publicKey],
      });
      if (simulation.err)
        throw new ShopError(
          "Could not prepare this pack. Check your SKR balance and SOL for additional fees. No payment was sent."
        );
      const remaining = simulation.accounts?.[0]?.lamports;
      if (
        remaining === undefined ||
        !Number.isSafeInteger(remaining) ||
        balance.basisPoints < BigInt(remaining)
      )
        throw new Error("Cannot estimate pack fees");
      return {
        buyer: buyerAddress,
        cluster: "mainnet-beta",
        transaction: Buffer.from(
          umi.transactions.serialize(transaction)
        ).toString("base64"),
        receipt: key,
        asset,
        edition: e.key,
        version: c.version,
        payment: c.payment,
        drops: c.drops,
        networkFeeLamports: (
          balance.basisPoints - BigInt(remaining)
        ).toString(),
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      };
    },
    validateSigned(order, signed) {
      return verifier.validateSigned(order, signed);
    },
    send(signed) {
      return verifier.send(signed);
    },
    height() {
      return umi.rpc.call<number>("getBlockHeight", [
        { commitment: "finalized" },
      ]);
    },
    async status(order) {
      const r = await receipt(order);
      if (r) {
        const status =
          r.state === 2
            ? "confirmed"
            : r.state === 1
            ? "ready-to-claim"
            : "waiting-result";
        const result = r.state > 0 ? order.drops[r.dropIndex]?.figureId : null;
        if (r.state > 0 && !result) throw new Error("Invalid pack result");
        return {
          status,
          signature: order.signature,
          result: result ?? null,
          randomness:
            r.state > 0 ? Buffer.from(r.randomness).toString("hex") : null,
        };
      }
      // An RPC outage must never turn a paid entitlement into a new purchase.
      if (
        order.status === "waiting-result" ||
        order.status === "ready-to-claim"
      )
        throw new Error(
          "Your paid pack is awaiting receipt reconciliation. Check again shortly."
        );
      const pending = {
        status: order.signature ? "submitted" : "prepared",
        signature: order.signature,
        result: null,
        randomness: null,
      } as const;
      if (order.signature) {
        const [s] = await umi.rpc.getSignatureStatuses(
          [base58.serialize(order.signature)],
          { searchTransactionHistory: true }
        );
        if (s?.commitment === "confirmed" || s?.commitment === "finalized") {
          if (s.error) return { ...pending, status: "failed" };
          throw new Error(
            "Confirmed purchase is awaiting receipt reconciliation"
          );
        }
        if (s) return pending;
      }
      if (
        (await umi.rpc.call<number>("getBlockHeight", [
          { commitment: "finalized" },
        ])) <= order.lastValidBlockHeight
      )
        return pending;
      const history = await umi.rpc.call<Array<{ signature: string }>>(
        "getSignaturesForAddress",
        [order.receipt, { commitment: "finalized", limit: 10 }]
      );
      if (history.length === 10)
        throw new Error("Pack purchase requires reconciliation");
      const expected = umi.transactions.deserialize(
        Buffer.from(order.transaction, "base64")
      );
      for (const entry of history) {
        const tx = await umi.rpc.getTransaction(
          base58.serialize(entry.signature),
          { commitment: "finalized" }
        );
        if (!tx) throw new Error("Pack purchase requires reconciliation");
        if (
          Buffer.from(tx.serializedMessage).equals(
            Buffer.from(expected.serializedMessage)
          )
        ) {
          if (tx.meta.err)
            return { ...pending, status: "failed", signature: entry.signature };
          throw new Error("Pack receipt requires reconciliation");
        }
      }
      return { ...pending, status: "expired" };
    },
    async prepareClaim(order) {
      const r = await receipt(order);
      if (!r || r.state !== 1) throw new Error("Pack is not ready to claim");
      const e = await edition(order.version);
      const escrow = findAssociatedTokenPda(umi, {
        mint: publicKey(PACK_PAYMENT.mint),
        owner: publicKey(order.receipt),
      });
      const buyerTokens = findAssociatedTokenPda(umi, {
        mint: publicKey(PACK_PAYMENT.mint),
        owner: publicKey(order.buyer),
      });
      const sellerTokens = findAssociatedTokenPda(umi, {
        mint: publicKey(PACK_PAYMENT.mint),
        owner: publicKey(e.e.treasury),
      });
      const accounts = [
        meta(umi.identity.publicKey, 3),
        meta(order.receipt, 1),
        meta(order.edition, 0),
        meta(order.buyer, 1),
        meta(umi.identity.publicKey, 2),
        meta(e.e.collection, 1),
        meta(order.asset, 1),
        meta(PACK_PAYMENT.mint, 0),
        meta(escrow[0], 1),
        meta(buyerTokens[0], 1),
        meta(sellerTokens[0], 1),
        meta(MPL_CORE_PROGRAM_ID, 0),
        meta(SHOP_TOKEN_PROGRAM, 0),
        meta(SYSTEM, 0),
      ];
      const blockhash = await umi.rpc.getLatestBlockhash();
      const tx = await transactionBuilder()
        .setVersion(0)
        .setFeePayer(umi.identity)
        .setBlockhash(blockhash)
        .add(setComputeUnitLimit(umi, { units: 600_000 }))
        .add(
          createIdempotentAssociatedToken(umi, {
            ata: sellerTokens,
            mint: publicKey(PACK_PAYMENT.mint),
            owner: publicKey(e.e.treasury),
            payer: umi.identity,
          })
        )
        .add({
          instruction: umiInstruction({
            programAddress: address(PACK_PROGRAM_ID),
            accounts,
            data: discriminator("global", "claim_pack"),
          }),
          signers: [umi.identity],
          bytesCreatedOnChain: 0,
        })
        .buildAndSign(umi);
      const simulation = await umi.rpc.simulateTransaction(tx, {
        verifySignatures: true,
      });
      if (simulation.err)
        throw new ShopError(
          "Your pack result is saved. Delivery is delayed; check again shortly.",
          503
        );
      return {
        transaction: Buffer.from(umi.transactions.serialize(tx)).toString(
          "base64"
        ),
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      };
    },
  };
}
