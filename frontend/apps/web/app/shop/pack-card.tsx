"use client";
import Image from "next/image";
import Link from "next/link";
import { figurePrice, formatSol, solFundingNotice, solanaExplorer } from "@rps/core/shop";
import { useFigureCatalog } from '../hooks/use-figure-catalog';
import { isTerminalPack, packPrice } from "@rps/core/packs";
import type { usePackShop } from "@rps/game-client/use-pack-shop";
import styles from "./shop.module.css";

export function PackCard({
  pack,
  address,
  blocked,
  onBuy,
  onConfirm,
}: {
  pack: ReturnType<typeof usePackShop>;
  address: string | null | undefined;
  blocked: boolean;
  onBuy(): void;
  onConfirm(): void;
}) {
  const order = pack.order;
  const catalog = pack.catalog;
  const definitions = useFigureCatalog();
  const name = (id: string) => definitions.find(f => f.id === id)?.name ?? id;
  const image = (id: string) => definitions.find(f => f.id === id)?.imageUrl ?? `/figures/${id}.png`;
  return (
    <section
      className={styles.review}
      aria-label="Fighter pack"
      aria-live="polite"
    >
      <h2>
        {order?.status === "confirmed" ? "Your new fighter!" : "Fighter pack"}
      </h2>
      {pack.error && <p role="alert">{pack.error}</p>}
      {catalog && !pack.hasPurchase && (
        <>
          <p>One pack. One surprise fighter. Available on every device.</p>
          <div className={styles.packDrops}>
            {catalog.drops.map((drop) => (
              <div key={drop.figureId}>
                <Image
                  unoptimized src={image(drop.figureId)}
                  alt=""
                  width={150}
                  height={150}
                />
                <strong>
                  {name(drop.figureId)}
                </strong>
                <span>{drop.weight / 10_000}% chance</span>
              </div>
            ))}
          </div>
          <p>
            {packPrice(catalog.payment)} + additional fees. Review the total
            before approval.
          </p>
          <button
            className={styles.primary}
            disabled={!catalog.available || !pack.ready || blocked || pack.busy}
            onClick={onBuy}
          >
            {!catalog.available
              ? "Packs coming soon"
              : address
              ? "Buy pack"
              : "Sign in to buy a pack"}
          </button>
        </>
      )}
      {pack.hasPurchase && (
        <>
          {pack.fundingRequired && <><p>Use SOL to cover the missing {pack.fundingRequired.symbol}. Review the total before approval.</p><button className={styles.primary} aria-busy={pack.busy} disabled={blocked || pack.busy || address !== pack.purchaseBuyer} onClick={() => { void pack.buyWithSol(); }}>Buy with SOL</button></>}
          <p>
            {order?.status === "confirmed"
              ? "Purchase complete. Your fighter is in your collection."
              : order?.status === "ready-to-claim"
              ? "Your result is saved. Delivering your fighter."
              : order?.status === "waiting-result"
              ? "Opening your pack. Your purchase is saved - no need to buy again."
              : order?.status === "submitted"
              ? "Checking your payment. You can leave and return to this saved pack."
              : order?.status === "failed" || order?.status === "expired"
              ? "This purchase did not complete. No figure was purchased."
              : "Review your pack. Nothing is purchased until you approve."}
          </p>
          {order?.status === "prepared" && (
            <>
              <p>
                {order.solFunding ? `Pack price: ${packPrice(order.payment)}. Estimated additional fees: ${formatSol(order.networkFeeLamports)}.` : `${packPrice(order.payment)} + ${figurePrice(order.networkFeeLamports, 'mainnet-beta')} estimated additional fees.`}
              </p>
              {order.solFunding && <><p>Pay with SOL: {formatSol(order.solFunding.inputLamports)}. Estimated total including fees: {formatSol((BigInt(order.solFunding.inputLamports) + BigInt(order.networkFeeLamports)).toString())}.</p><p>{solFundingNotice(order.solFunding)}</p></>}
              <p>
                {order.drops
                  .map(
                    (d) =>
                      `${name(d.figureId)} ${
                        d.weight / 10_000
                      }%`
                  )
                  .join(" · ")}
              </p>
              <button
                className={styles.primary}
                disabled={blocked || pack.busy || address !== order.buyer}
                onClick={onConfirm}
              >
                Approve pack purchase
              </button>
              {address !== order.buyer && (
                <p>Sign in to the account selected for this saved purchase.</p>
              )}
            </>
          )}
          {order?.status === "confirmed" && order.result && (
            <>
              <Image
                unoptimized src={image(order.result)}
                alt={
                  name(order.result)
                }
                width={220}
                height={220}
              />
              <h3>{name(order.result)}</h3>
              <div className={styles.actions}>
                <Link href={`/army?minted=${encodeURIComponent(order.asset)}`}>
                  Add to your army
                </Link>
                <a
                  href={solanaExplorer(
                    "address",
                    order.receipt,
                    "mainnet-beta"
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View pack record
                </a>
              </div>
            </>
          )}
          <div className={styles.actions}>
            <button
              disabled={pack.busy}
              onClick={() => {
                void pack.checkStatus();
              }}
            >
              Check pack status
            </button>
            {(!pack.signingStarted ||
              Boolean(order && isTerminalPack(order))) && (
              <button
                disabled={pack.busy}
                onClick={() => {
                  void pack.dismiss();
                }}
              >
                {order && isTerminalPack(order)
                  ? "Done"
                  : "Cancel pack purchase"}
              </button>
            )}
          </div>
        </>
      )}
      {!catalog && !pack.hasPurchase && (
        <button
          onClick={() => {
            void pack.loadCatalog();
          }}
        >
          Check pack availability
        </button>
      )}
    </section>
  );
}
