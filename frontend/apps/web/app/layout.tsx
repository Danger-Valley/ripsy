import './globals.css';
import WalletProviders from './providers/WalletProviders';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <WalletProviders>
          {children}
          <Toaster richColors expand={true} position="top-center" />
        </WalletProviders>
      </body>
    </html>
  );
}

