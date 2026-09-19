"use client";

import dynamic from 'next/dynamic';
import { ShopContent } from './shop-content';

// Keep the sizeable auth SDK scoped to the shop and out of the game bundle.
const PrivyShop = dynamic(() => import('./privy-shop'), { ssr: false, loading: () => <main style={{ padding: 32 }} aria-busy="true">Opening your figure shop…</main> });

export default function ShopPage() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  return appId ? <PrivyShop appId={appId} /> : <ShopContent />;
}
