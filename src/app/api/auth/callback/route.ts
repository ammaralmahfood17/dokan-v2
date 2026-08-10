import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles Supabase email confirmation / magic-link redirects.
 * Exchanges ?code= for a session cookie, then sends the user to onboarding.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reqHost = new URL(request.url).host;
  // Redirect base: prefer the configured production origin when the request
  // host matches it (poisoned Host headers can't hijack prod); fall back to
  // the request origin so preview deployments still work.
  let origin = new URL(request.url).origin;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      if (new URL(siteUrl).host === reqHost) origin = new URL(siteUrl).origin;
    } catch { /* malformed env — keep request origin */ }
  }
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/onboarding';
  // Open-redirect guard: only allow same-origin relative paths.
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
      ? next
      : '/onboarding';

  try {
    if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
    }
  } catch (err) {
    console.error('auth callback failed', err);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
