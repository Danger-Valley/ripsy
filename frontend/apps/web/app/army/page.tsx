"use client";

import dynamic from 'next/dynamic';
import { ArmyContent } from './army-content';

const PrivyArmy = dynamic(() => import('./privy-army'), { ssr: false, loading: () => <main style={{ padding: 32 }} aria-busy="true">Opening your army…</main> });

export default function ArmyPage() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  return appId ? <PrivyArmy appId={appId} /> : <ArmyContent />;
}
