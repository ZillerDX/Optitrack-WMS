import type { Metadata, Viewport } from 'next';
import ClientLayout from './ClientLayout';
import '../globals.css';
import { PWARegister } from '@/components/pwa/PWARegister';

export const metadata: Metadata = {
  title: 'OptiTrack WMS - Warehouse Management System',
  description: 'Enterprise Warehouse Management System with Barcode Scanner & Real-Time Inventory Tracking',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OptiTrack WMS',
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark legacy-dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#020617" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">
        <ClientLayout>{children}</ClientLayout>
        <PWARegister />
      </body>
    </html>
  );
}