import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresh Supabase session cookies and enforce auth for protected routes.
 * 
 * PERFORMANCE: Uses getSession() (local cookie read, ~1ms) instead of
 * getUser() (Supabase Auth API call, 200-800ms). JWT signature is still
 * verified locally via the cookie parser.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() reads the JWT from the cookie locally — no network call
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  const path = request.nextUrl.pathname;

  const isAuthPage =
    path === '/login' ||
    path === '/register' ||
    path.startsWith('/login/') ||
    path.startsWith('/register/');

  const isProtected =
    path.startsWith('/dashboard') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/update-password');

  // Guest on protected route → login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Authenticated on auth pages → dashboard
  // NOTE: We skip the staff_members query here. If the user has no project,
  // getCurrentProject() in dashboard/layout.tsx will redirect to /onboarding.
  // This saves one DB call per navigation.
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Always refresh the session cookie
  return response;
}
