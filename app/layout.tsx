import type { Metadata, Viewport } from 'next';
import { Josefin_Sans, Roboto } from 'next/font/google';
import './globals.css';

/**
 * UNIQUE-PLACES-Typografie (siehe Housekeeping-Redesign-Briefing): Josefin Sans fuer
 * Ueberschriften, Roboto fuer Flies-/UI-Text. Self-hosted via next/font (kein Laufzeit-Request
 * an Google Fonts, kein Layout-Shift). Als CSS-Variablen exponiert, die app/globals.css'
 * `--font-heading` / `--font-sans`-Tokens fuettern.
 */
const josefinSans = Josefin_Sans({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-josefin',
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-roboto',
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
  themeColor: '#F8F6F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${josefinSans.variable} ${roboto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
