import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * UNIQUE-PLACES-Typografie: Inter fuer den gesamten Flies-/UI-Text (inkl. der kursiven
 * Ueberschriften wie dem Login-Titel - Inter ist eine Variable Font mit eigenem Kursivschnitt,
 * daher genuegt die Tailwind-`italic`-Utility ohne separate Ueberschriftenschrift). Self-hosted
 * via next/font, als CSS-Variable exponiert, die app/globals.css' `--font-sans`-Token fuettert.
 */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
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
    <html lang="de" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
