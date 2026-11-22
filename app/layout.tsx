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
    // Nutzerfeedback ("unscharfer Bereich oben kommt vom iPhone selbst"): 'black-translucent'
    // laesst iOS die Statusleiste TRANSPARENT UEBER den Inhalt legen - die Seite muss dafuer per
    // env(safe-area-inset-top) selbst genug Platz lassen (siehe StaffHeader.tsx), was auf manchen
    // Geraeten/iOS-Versionen im installierten Homescreen-Modus trotzdem dazu fuehrte, dass der
    // Header-Markenname im (von iOS selbst mit einem leichten Verlauf/Weichzeichner hinterlegten)
    // Statusleisten-Bereich verschwamm. 'default' laesst iOS stattdessen eine normale, UNDURCHSICHTIGE
    // (helle) Statusleiste reservieren, die den Seiteninhalt nicht mehr ueberlagert - kein manuelles
    // Freihalten mehr noetig, kein Ueberlappungs-/Weichzeichnungseffekt mehr moeglich.
    statusBarStyle: 'default',
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
