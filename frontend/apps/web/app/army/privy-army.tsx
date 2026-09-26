"use client";

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useCreateWallet, useSignMessage, useWallets } from '@privy-io/react-auth/solana';
import { createSignInMessage } from '@solana/wallet-standard-util';
import type { WalletChallenge, WalletProof } from '@rps/core/shop';
import { ArmyContent, type EmbeddedArmyWallet } from './army-content';

export default function PrivyArmy({ appId }: { appId: string }) {
  return <PrivyProvider appId={appId} clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID} config={{
    appearance: { theme: 'dark', accentColor: '#66FCF1', walletChainType: 'solana-only' },
    loginMethods: ['email', 'google', 'apple'],
    embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } },
  }}><AuthenticatedArmy /></PrivyProvider>;
}

function AuthenticatedArmy() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { signMessage } = useSignMessage();
  const wallet = wallets.find(candidate => 'isPrivyWallet' in candidate.standardWallet && candidate.standardWallet.isPrivyWallet === true);
  const embedded: EmbeddedArmyWallet = {
    ready,
    authenticated,
    address: wallet?.address ?? null,
    login: () => login(),
    logout,
    createWallet: async () => { await createWallet(); },
    proveWallet: async (challenge: WalletChallenge): Promise<WalletProof> => {
      if (!wallet) throw new Error('Sign in to your embedded wallet first.');
      const message = createSignInMessage({ ...challenge, address: wallet.address });
      const result = await signMessage({ message, wallet });
      return { address: wallet.address, nonce: challenge.nonce, signature: Array.from(result.signature), signedMessage: Array.from(message) };
    },
  };
  return <ArmyContent embedded={embedded} />;
}
