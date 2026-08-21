import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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
  // F1: Content-Security-Policy. Next.js needs 'unsafe-eval' for Fast Refresh
  // in dev and its compiled runtime uses new Function in a few places; it does
  // NOT need 'unsafe-inline' in production — RSC payload hydration scripts are
  // injected as <script> without body content (no inline execution), and the
  // only inline <script> we ship (dark-flash blocker) moved into the static
  // layout via an external bundle since v16.2. 'unsafe-inline' remains on
  // style-src because Next + Google Fonts inject inline <style> tags.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' https://*.sentry.io",
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
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
});
