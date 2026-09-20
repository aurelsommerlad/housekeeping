import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';

/**
 * UNIQUE-PLACES-Typografie - 1:1 aus dem tatsaechlichen Owner-Center-Quellcode uebernommen
 * (src/app/layout.tsx dort: Inter fuer Flies-/UI-Text, Fraunces fuer Ueberschriften/Display,
 * inkl. Kursivschnitt fuer z. B. den Login-Titel). Self-hosted via next/font, als CSS-Variablen
 * exponiert, die app/globals.css' `--font-heading` / `--font-sans`-Tokens fuettern.
 */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Housekeeping · UNIQUE PLACES',
  description: 'UNIQUE PLACES Housekeeping - tägliche operative Zimmerübersicht.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Housekeeping',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAF8F4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
