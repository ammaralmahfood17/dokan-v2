import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';

/**
 * POST /api/auth/reset-password
 * Sends a password reset email to the user.
 * Rate limited to prevent abuse.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };

    // Input hardening FIRST (audit MEDIUM fix) — validate before the value
    // becomes a rate-limit DB key.
    if (
      typeof body.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email.trim()) ||
      body.email.trim().length > 254
    ) {
      return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();

    // Rate limit: 2 requests per email per 5 minutes (clamped email key)
    const limitResult = await rateLimit(`reset:${email}`, {
      limit: 2,
      windowMs: 5 * 60 * 1000,
      keyPrefix: 'auth-reset',
    });

    if (!limitResult.allowed) {
      const res = createRateLimitResponse(limitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    // IP cap too — mass reset attempts across many emails from one IP
    // (enumeration/email-bombing) bypasses the per-email limit entirely.
    const ip = getClientIp(request);
    const ipLimit = await rateLimit(`reset-ip:${ip}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
      keyPrefix: 'auth-reset-ip',
    });
    if (!ipLimit.allowed) {
      const res = createRateLimitResponse(ipLimit.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    const supabase = await createClient();
    // NEVER trust the Origin header for a security-critical email link — an
    // attacker controls it and could harvest the recovery code. Use a fixed
    // production origin (mirrors the previous fallback constant).
    //
    // IMPORTANT: redirect straight to /update-password, NOT /auth/callback.
    // The verify 303 lands with the session in the URL FRAGMENT
    // (#access_token=...) — fragments never reach the server, so a server
    // callback route would drop the token and bounce to /login. The browser
    // client (createBrowserClient) parses the fragment on load, which is
    // exactly what /update-password does.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://www.dokanstore.xyz/update-password',
    });

    if (error) {
      console.error('[Reset Password]', error);
      // Don't reveal if email exists or not (security)
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reset password API error:', err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
