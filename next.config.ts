import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const isDevelopment = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // F1: Content-Security-Policy. Fast Refresh needs 'unsafe-eval' in dev;
  // production omits it. Phase-0 hotfix (Sep 6 2026 audit): Next.js 16 App
  // Router injects its RSC payload as inline <script> tags — without
  // 'unsafe-inline' they are CSP-blocked, hydration never runs, and every
  // interactive component on the site is dead (verified: 14 CSP violations,
  // no React fiber, submit handlers never fire). 'unsafe-inline' is the
  // interim fix; the proper nonce-based CSP lands in task 1.1.
  // style-src keeps 'unsafe-inline' because Next + Google Fonts inject
  // inline <style> tags.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https://*.sentry.io`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' blob: data: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://sentry.io https://*.ingest.sentry.io",
      "font-src 'self' https://fonts.gstatic.com",
      "object-src 'none'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // /sw.js must never be cached (it's not content-hashed — a stale SW
      // would delay updates by up to 24h).
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      // Versioned/immutable static assets → long cache.
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/splash/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/screenshots/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/offline.html',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
};

// Sentry wraps the config; harmless without SENTRY_DSN (SDK no-ops).
// Auth tokens: no sentry.authToken set → CI/source-map upload disabled until
// the user adds Sentry credentials in the dashboard.
export default withSentryConfig(withAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
});
