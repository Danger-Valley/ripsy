import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Play RIPSY',
  description: 'Create a RIPSY battle, join with a room code, or continue an active game.',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
