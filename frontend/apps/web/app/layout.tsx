import './globals.css';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';
import { Metadata } from 'next';
import localFont from 'next/font/local';

const sans = localFont({
  src: [
    { path: './fonts/space-grotesk-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/space-grotesk-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/space-grotesk-700.ttf', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-sans',
});

const mono = localFont({
  src: [
    { path: './fonts/space-mono-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/space-mono-700.ttf', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-mono',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
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
