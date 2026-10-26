import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AppProviders } from '@/components/providers/AppProviders';
import { PWARegister } from '@/components/pwa/PWARegister';
import { themeScript } from '@/lib/theme';
import '../globals.css';

// Self-hosted by Next at build time (no request to Google when the page is opened).
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'OptiTrack WMS', template: '%s | OptiTrack WMS' },
  description: 'Warehouse management: stock, movements and reorder planning.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'OptiTrack WMS' },
  icons: { icon: '/icons/icon-192x192.png', apple: '/icons/icon-192x192.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1320' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Root layout of the redesigned pages. The pages not yet redesigned live in the (legacy) group with their
 * own root layout; moving between the two is a full page load.
 */
export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script may add the `dark` class before React hydrates
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
        <PWARegister />
      </body>
    </html>
  );
}
