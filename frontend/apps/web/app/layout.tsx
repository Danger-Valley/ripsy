import './globals.css';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';
import { Metadata } from 'next';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <Toaster richColors expand={true} position="top-right" />
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.ico',
  },
}
