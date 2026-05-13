import './globals.css';
import WalletProviders from './providers/WalletProviders';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';
import { Metadata } from 'next';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <WalletProviders>
          {children}
          <Toaster richColors expand={true} position="top-right" />
        </WalletProviders>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.ico',
  },
}