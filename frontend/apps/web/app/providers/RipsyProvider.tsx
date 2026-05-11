'use client';
import { useMemo, ReactNode } from 'react';
import { RipsyContext, RipsyGameClient } from '@rps/solana-client';
import { useConnectorClient, useTransactionSigner, useAccount } from "@solana/connector/react";
import { useParams } from 'next/navigation';
import { aD } from 'node_modules/@solana/connector/dist/standard-shim-BB0Lkg_C';

export const RipsyProvider = ({ children }: { children: ReactNode }) => {
  const { address } = useAccount();
  const connectorClient = useConnectorClient();
  const { signer } = useTransactionSigner();
  const { id: gamePda } = useParams();

  const gameClient = useMemo(() => {
    if (!signer || !address || !connectorClient) return null;
    console.log("User address: ", address)

    return new RipsyGameClient(connectorClient, address, signer, gamePda as string);
  }, [address, connectorClient, signer, gamePda]);

  return (
    <RipsyContext.Provider value={{ gameClient }}>
      {children}
    </RipsyContext.Provider>
  );
};

