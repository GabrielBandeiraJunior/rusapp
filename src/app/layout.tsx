import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Noto_Sans } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { SwRegister } from '@/components/SwRegister';
import { TabBar } from '@/components/TabBar';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-sans' });
// russo: fonte com posicionamento correto do acento combinante (U+0301)
const noto = Noto_Sans({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-ru', weight: ['400', '600', '700'] });

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
    <html lang="pt-BR" className={`${inter.variable} ${noto.variable}`}>
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
