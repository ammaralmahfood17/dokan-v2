import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js 16 proxy (replaces middleware.ts).
 * Refreshes auth session and guards /dashboard + /onboarding.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/onboarding',
    '/onboarding/:path*',
    '/login',
    '/register',
    '/reset-password',
    // /super-admin: edge bounce for guests (cheaper than rendering the
    // layout guard); the per-request requireSuperAdmin() stays as backstop.
    '/super-admin/:path*',
    // POS API: refreshes the auth cookies before the route handler. Route
    // handlers remain the final authorization boundary and must verify the
    // user, project membership, and role themselves.
    '/api/pos/:path*',
  ],
};
