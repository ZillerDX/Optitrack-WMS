import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import ClientLayout from './ClientLayout';
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

export function generateStaticParams() {
  return [{locale: 'en'}];
}

export default async function LocaleLayout({
  children,
  params: {locale}
}: {
  children: React.ReactNode;
  params: {locale: string};
}) {
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#020617" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">
        <NextIntlClientProvider messages={messages}>
          <ClientLayout params={{locale}}>
            {children}
          </ClientLayout>
          <PWARegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}