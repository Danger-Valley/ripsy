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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '256x256' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  },
};
