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
  ],
};
