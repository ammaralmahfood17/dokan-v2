import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from 'next/font/google';
import { Toaster } from 'sonner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { WebVitals } from '@/components/web-vitals';
// D15: install-to-homescreen prompt (beforeinstallprompt on Android/Chrome).
import { InstallPrompt } from '@/components/ui/install-prompt';
import './globals.css';

// "دكان" — Editorial identity v2.0
// IBM Plex Sans Arabic: الواجهة العربية + الأرقام. Noto Kufi Arabic:
// display kufi for headings and brand. Arabic-first pairing from the
// reference dashboard design.
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans-arabic',
  display: 'swap',
});

const notoKufi = Noto_Kufi_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-noto-kufi',
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
  // FIX-M-004: Open Graph + Twitter — المشاركة على واتساب/تيليجرام تعرض
  // عنوانًا وصورة بدل رابط أعمى.
  openGraph: {
    type: 'website',
    locale: 'ar_BH',
    // Canonical host comes from env (matches Vercel domain setting); the
    // hardcoded value previously diverged from the live apex domain.
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dokanstore.xyz',
    siteName: 'دكان',
    title: 'دكان — منصة إدارة المطاعم',
    description: 'منصة سحابية لإدارة المطاعم والمقاهي في الخليج',
    images: [
      {
        url: '/og-image.jpg',
        width: 1024,
        height: 576,
        alt: 'دكان — منصة إدارة المطاعم',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'دكان — منصة إدارة المطاعم',
    description: 'منصة سحابية لإدارة المطاعم والمقاهي في الخليج',
    images: ['/og-image.jpg'],
  },
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
  // FIX-R-001: تفعيل safe areas على iPhone مع notch (env(safe-area-inset-*))
  viewportFit: 'cover',
  // Aligned with manifest.ts theme_color (#0F5E56) — browser chrome and
  // install prompt must not disagree.
  themeColor: '#0F5E56',
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
      className={`${ibmPlexSansArabic.variable} ${notoKufi.variable}`}
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
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
        <link rel="apple-touch-startup-image" href="/splash/light-1242x2688.png" />
        {/* Preload auth route (public); dashboard prefetches removed — they
            wasted bandwidth on guest visits and got edge-redirected anyway. */}
        <link rel="prefetch" href="/login" as="document" />
      </head>
      <body>
        {/* D5: skip-to-content — keyboard users jump straight past the
            nav/chrome to the page content (visually hidden until focused). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[var(--z-skip-link)] focus:rounded-[var(--radius-md)] focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          تخطي إلى المحتوى
        </a>
        <div id="main-content">
          {children}
        </div>
        <Toaster position="top-center" richColors dir="rtl" />
        <ServiceWorkerRegister />
        <WebVitals />
        <InstallPrompt />
      </body>
    </html>
  );
}
