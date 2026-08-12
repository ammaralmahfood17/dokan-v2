/**
 * Startup Environment Validation
 * Ensures critical environment variables are present in production to
 * avoid silent failures. Only the Supabase trio is fatal — VAPID (push)
 * degrades gracefully in push.ts, so a missing pair must warn, not crash.
 */

type RequiredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export function validateEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  const required: Partial<RequiredEnv> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `FATAL: Missing critical environment variables in production: ${missing.join(', ')}. ` +
      `The application cannot start without these. Please check your Vercel environment settings.`
    );
  }

  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('[env] VAPID keys missing — push notifications disabled (graceful).');
  }
}