"use client";
import Image from "next/image";
import Link from "next/link";
import { FIGURES, figurePrice, solanaExplorer } from "@rps/core/shop";
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
                  src={`/figures/${drop.figureId}.png`}
                  alt=""
                  width={150}
                  height={150}
                />
                <strong>
                  {FIGURES.find((f) => f.id === drop.figureId)?.name}
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
                {packPrice(order.payment)} +{" "}
                {figurePrice(order.networkFeeLamports, "mainnet-beta")}{" "}
                estimated additional fees.
              </p>
              <p>
                {order.drops
                  .map(
                    (d) =>
                      `${FIGURES.find((f) => f.id === d.figureId)?.name} ${
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
                src={`/figures/${order.result}.png`}
                alt={
                  FIGURES.find((f) => f.id === order.result)?.name ??
                  "Your fighter"
                }
                width={220}
                height={220}
              />
              <h3>{FIGURES.find((f) => f.id === order.result)?.name}</h3>
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
