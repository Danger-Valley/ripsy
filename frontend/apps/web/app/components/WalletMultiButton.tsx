"use client";

import type { CSSProperties } from "react";
import {
  useWalletConnectors,
  useConnectWallet,
  useDisconnectWallet,
  useWallet,
} from "@solana/connector/react";

type Props = { style?: CSSProperties };

/** Replaces `@solana/wallet-adapter-react-ui` WalletMultiButton for ConnectorKit. */
export function WalletMultiButton({ style }: Props) {
  const { isConnected, account } = useWallet();
  const connectors = useWalletConnectors();
  const { connect, isConnecting, error, resetError } = useConnectWallet();
  const { disconnect, isDisconnecting } = useDisconnectWallet();

  if (isConnected && account) {
    const short = `${account.slice(0, 4)}…${account.slice(-4)}`;
    return (
      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={isDisconnecting}
        style={style}
      >
        {isDisconnecting ? "…" : short}
      </button>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      {error ? (
        <span style={{ color: "#f66", fontSize: 12 }}>
          {error.message}
          <button
            type="button"
            onClick={() => resetError()}
            style={{ marginLeft: 8 }}
          >
            ✕
          </button>
        </span>
      ) : null}
      {connectors.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => void connect(c.id)}
          disabled={isConnecting || !c.ready}
          style={style}
        >
          {isConnecting ? "Connecting…" : `Connect ${c.name}`}
        </button>
      ))}
    </div>
  );
}
