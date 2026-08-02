import type { Metadata, Viewport } from 'next';
import { El_Messiri, IBM_Plex_Sans_Arabic, IBM_Plex_Mono, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { WebVitals } from '@/components/web-vitals';
import './globals.css';

// "شبكة المسح" — Scan Grid identity
// Display: El Messiri (600/700) — عناوين كبيرة وشعار فقط
// UI:      IBM Plex Sans Arabic (400/500/600) — واجهة ونصوص، وضوح تشغيلي
// Mono:    IBM Plex Mono (500/600) — أرقام الطلبات والوقت والأسعار (طابع الإيصال)
const elMessiri = El_Messiri({
  subsets: ['arabic', 'latin'],
  weight: ['600', '700'],
  variable: '--font-el-messiri',
  display: 'swap',
});

const plexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

// POS keeps Inter for Latin/figures (Polaris-style cashier surface)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : '';

export const metadata: Metadata = {
  title: {
    default: 'دكان — منصة إدارة المطاعم',
    template: '%s — دكان',
  },
  description: 'منصة سحابية لإدارة المطاعم والمقاهي في الخليج',
  icons: [
    { rel: 'icon', url: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' },
  ],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'دكان',
    statusBarStyle: 'black-translucent',
  },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F1E6' },
    { media: '(prefers-color-scheme: dark)', color: '#14110C' },
  ],
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
      className={`${elMessiri.variable} ${plexSansArabic.variable} ${plexMono.variable} ${inter.variable}`}
    >
      <head>
        {/* Supabase: early connect */}
        {supabaseUrl && (
          <>
            <link rel="preconnect" href={supabaseOrigin} />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
        {/* iOS touch icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-maskable-512.png" />
        <link rel="apple-touch-startup-image" media="(prefers-color-scheme: light)" href="/splash/light-1242x2688.png" />
        <link rel="apple-touch-startup-image" media="(prefers-color-scheme: dark)" href="/splash/dark-1242x2688.png" />
        {/* Preload critical routes */}
        <link rel="prefetch" href="/dashboard" as="document" />
        <link rel="prefetch" href="/dashboard/kitchen" as="document" />
        <link rel="prefetch" href="/dashboard/pos" as="document" />
        <link rel="prefetch" href="/login" as="document" />
        {/* Blocking script: apply dark mode before paint, prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dokan-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        {children}
        <Toaster position="top-center" richColors dir="rtl" />
        <ServiceWorkerRegister />
        <WebVitals />
      </body>
    </html>
  );
}
