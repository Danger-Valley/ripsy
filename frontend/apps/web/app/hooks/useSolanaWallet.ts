"use client";

import { useWallet } from "@solana/connector/react";
import { address, type Address } from "@solana/addresses";

/**
 * Drop-in replacement for legacy `@solana/wallet-adapter-react` useWallet()
 * shape: `{ connected, publicKey }` using ConnectorKit + Kit {@link Address}.
 */
export function useSolanaWallet() {
  const { isConnected, account } = useWallet();
  const addr = account ? address(account) : null;
  return {
    connected: isConnected,
    /** Kit address (base58); use like `publicKey` from wallet-adapter (string + `.toString()`). */
    publicKey: addr,
    account: addr,
  };
}

export type { Address };
