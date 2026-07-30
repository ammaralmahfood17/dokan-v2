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
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'دكان — منصة إدارة المطاعم',
    template: '%s — دكان',
  },
  description: 'منصة سحابية لإدارة المطاعم والمقاهي في الخليج',
  icons: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  manifest: '/manifest.webmanifest',
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0F17' },
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
      className={`${cairo.variable} ${tajawal.variable} ${notoSansArabic.variable}`}
    >
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-maskable-512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="دكان" />
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
      </body>
    </html>
  );
}
