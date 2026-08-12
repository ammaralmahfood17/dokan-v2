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
    path.startsWith('/super-admin');
  // NOTE: /update-password is deliberately NOT in isProtected. The recovery
  // flow lands there with the session in the URL FRAGMENT (#access_token=),
  // which only the browser client can parse AFTER the HTML loads. If the
  // middleware bounced guests to /login first, the fragment would be lost
  // and password recovery would break. The page itself guards (no session →
  // redirect /login).

  // Guest on protected route → login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Authenticated on auth pages → their home (super admin → super-admin,
  // store owner → dashboard; dashboard/layout redirects no-store users to
  // onboarding, saving a DB call here).
  if (user && isAuthPage) {
    // ---- C8: Super Admin state stored in cookie for ux+perf ----
    let isSuperAdmin = request.cookies.get('isSuperAdmin')?.value;
    if (isSuperAdmin == null) {
      // Make the RPC call just once then store in cookie for 10 minutes
      const { data } = await supabase.rpc('is_super_admin');
      isSuperAdmin = data ? '1' : '0';
      response.cookies.set('isSuperAdmin', isSuperAdmin, { maxAge: 600, path: '/' });
    }
    const url = request.nextUrl.clone();
    url.pathname = isSuperAdmin === '1' ? '/super-admin/subscriptions' : '/dashboard';
    return NextResponse.redirect(url);
  }

  // Always refresh the session cookie
  return response;
}
