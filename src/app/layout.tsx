import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { SwRegister } from '@/components/SwRegister';
import { TabBar } from '@/components/TabBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Russo — casos, não decoreba',
  description: 'Aprenda o sistema do russo (casos, aspecto, leitura) digitando as formas. Funciona offline.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Russo', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0e14' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          {children}
          <TabBar />
        </Providers>
        <SwRegister />
      </body>
    </html>
  );
}
