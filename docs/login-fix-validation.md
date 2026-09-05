# Login fix validation

## Reproduction

The production Dokan login URL rendered the redesigned shell but left the form area on a loading skeleton. The live register route rendered normally, isolating the issue to the login route. The same behavior was reproducible locally before the fix.

## Root cause

`src/app/login/login-client.tsx` called `useSearchParams()` from two nested client components while `src/app/login/page.tsx` wrapped the client tree in Suspense. In the deployed Next.js 16 build, this streamed boundary did not resolve in the browser, leaving the login page unusable. The form itself was present in the server response but remained hidden behind the unresolved boundary.

## Fix

The login page is now a normal static route. Query parameters are parsed after hydration through a small `useSyncExternalStore` location snapshot. The implementation preserves the `registered=1` success notice and the same-origin-only `next` redirect guard, while removing the blocking `useSearchParams` Suspense dependency.

## Validation

The local browser now displays the email field, password field, password visibility control, login button, reset-password link, and registration link. The production checks completed successfully: ESLint passed with zero warnings, 29 Vitest tests passed, and the Next.js production build completed successfully. The route remains statically prerendered as `/login`.
