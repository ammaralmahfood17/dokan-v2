import type { Metadata, Viewport } from 'next';
import { Cairo, Tajawal, Noto_Sans_Arabic } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-cairo',
  display: 'swap',
});

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-sans-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'دكان — إدارة طلبات المطاعم والمقاهي',
    template: '%s | دكان',
  },
  description:
    'منصة SaaS متعددة المستأجرين للمقاهي والمطاعم وعربات الطعام في الخليج. قائمة QR، طلبات فورية، شاشة مطبخ، ونقطة بيع.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'دكان',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#4338CA',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} ${tajawal.variable} ${notoSansArabic.variable}`}
      style={{ fontFamily: 'var(--font-cairo), var(--font-tajawal), var(--font-noto-sans-arabic), sans-serif' }}
    >
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        {/* Page enter animation */}
        <style>{`@keyframes page-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.page-enter{animation:page-enter .25s ease-out both}`}</style>
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          dir="rtl"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-cairo), var(--font-tajawal), sans-serif',
              direction: 'rtl',
            },
          }}
        />
      </body>
    </html>
  );
}
