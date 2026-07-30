-- ============================================================================
-- Migration 0022 — Reserved-slug protection at the DB level
-- ============================================================================
-- src/lib/slug.ts already blocks reserved words (admin, dashboard, login,
-- etc.) when generating a slug through the app. This constraint is a second
-- line of defense: it means an app bug, a future internal tool, or a direct
-- SQL insert can never silently create a business slug that would collide
-- with a real top-level route.
-- ============================================================================

alter table public.businesses
  add constraint businesses_slug_not_reserved
  check (
    slug not in (
      'login', 'register', 'forgot-password', 'reset-password',
      'admin', 'dashboard', 'kitchen', 'm', 'api', 'auth',
      'privacy', 'terms', '_next', 'favicon.ico', 'manifest.webmanifest'
    )
  );
