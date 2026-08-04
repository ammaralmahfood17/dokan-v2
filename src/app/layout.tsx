import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import { Toaster } from 'sonner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { WebVitals } from '@/components/web-vitals';
import './globals.css';

// "دكان" — Enterprise identity v1.0
// Cairo only (400/500/600/700/800) — واجهة + أرقام + عناوين بخط واحد
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
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
    statusBarStyle: 'default',
  },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F8FAFC',
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
      className={`${cairo.variable}`}
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
        <link rel="apple-touch-startup-image" href="/splash/light-1242x2688.png" />
        {/* Preload critical routes */}
        <link rel="prefetch" href="/dashboard" as="document" />
        <link rel="prefetch" href="/dashboard/kitchen" as="document" />
        <link rel="prefetch" href="/dashboard/pos" as="document" />
        <link rel="prefetch" href="/login" as="document" />
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
