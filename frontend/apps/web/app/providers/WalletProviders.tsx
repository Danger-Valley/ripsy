"use client";
import { ReactNode, useMemo } from "react";
import { AppProvider } from "@solana/connector/react";
import { getDefaultConfig, getDefaultMobileConfig } from "@solana/connector/headless";

const appName = "RPS Arena";

export function WalletProviders({ children }: { children: ReactNode }) {
  const connectorConfig = useMemo(
    () =>
      getDefaultConfig({
        appName,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        autoConnect: true,
        enableMobile: true,
        clusters: [
          {
            id: "solana:devnet" as const,
            label: "Devnet",
            url: "https://api.devnet.solana.com",
          },
        ],
        wallets: {
          allowList: ["Phantom", "Solflare", "Backpack"],
          featured: ["Phantom", "Solflare", "Backpack"],
        },
      }),
    [],
  );

  const mobile = useMemo(
    () =>
      getDefaultMobileConfig({
        appName,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      }),
    [],
  );

  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
      {children}
    </AppProvider>
  );
}

export default WalletProviders;
