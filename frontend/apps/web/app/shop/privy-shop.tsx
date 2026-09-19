"use client";

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction, useCreateWallet } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions, getBase64Decoder, getBase64Encoder } from '@solana/kit';
import { ShopContent } from './shop-content';

export default function PrivyShop({ appId }: { appId: string }) {
  return <PrivyProvider appId={appId} clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID} config={{
    appearance: { theme: 'dark', accentColor: '#66FCF1', walletChainType: 'solana-only' },
    loginMethods: ['email', 'google', 'apple'],
    embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } },
    solana: { rpcs: {
      'solana:devnet': { rpc: createSolanaRpc(process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'), rpcSubscriptions: createSolanaRpcSubscriptions(process.env.NEXT_PUBLIC_SOLANA_DEVNET_WS_URL ?? 'wss://api.devnet.solana.com') },
      'solana:mainnet': { rpc: createSolanaRpc(process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com'), rpcSubscriptions: createSolanaRpcSubscriptions(process.env.NEXT_PUBLIC_SOLANA_MAINNET_WS_URL ?? 'wss://api.mainnet-beta.solana.com') },
    } },
  }}><AuthenticatedShop /></PrivyProvider>;
}

function AuthenticatedShop() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { signTransaction } = useSignTransaction();
  const wallet = wallets.find(candidate => 'isPrivyWallet' in candidate.standardWallet && candidate.standardWallet.isPrivyWallet === true);
  return <ShopContent embedded={{
    ready, authenticated, address: wallet?.address ?? null,
    login: () => login(), logout, createWallet: async () => { await createWallet(); },
    sign: async order => {
      if (!wallet || wallet.address !== order.buyer) throw new Error('Sign in to the wallet selected for this purchase.');
      const result = await signTransaction({ transaction: Uint8Array.from(getBase64Encoder().encode(order.transaction)), wallet, chain: order.cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet' });
      return getBase64Decoder().decode(result.signedTransaction);
    },
  }} />;
}
