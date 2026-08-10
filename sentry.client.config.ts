/**
 * Sentry client config — browser errors.
 * Disabled until SENTRY_DSN is set in Vercel env (SDK no-ops without a DSN).
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // No session replay: POS/orders/kitchen render customer names, phones
    // and order contents — DOM snapshots on error would capture PII.
    environment: process.env.VERCEL_ENV || 'development',
  });
}
