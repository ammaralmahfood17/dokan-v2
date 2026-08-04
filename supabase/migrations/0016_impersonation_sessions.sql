-- ============================================================================
-- 0016_impersonation_sessions.sql
-- Phase C — super-admin "login as" support sessions.
--
-- SECURITY MODEL:
-- - No password is ever exposed or reset. The owner session is minted
--   server-side via admin.generateLink(magiclink) + verifyOtp(token_hash).
-- - The super admin's OWN session (tokens) is stored here so ending the
--   impersonation (or auto-expiry) can restore it — the admin never gets
--   logged out of their own account.
-- - Hard 30-minute expiry checked on EVERY request (layout); expired rows
--   are unusable even if a stale cookie survives.
-- - service_role-only table (RLS enabled, no policies, no anon/auth grants).
-- ============================================================================

CREATE TABLE public.impersonation_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    super_admin_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    target_project_id uuid,
    -- Tokens are secrets: never exposed to the client. The layout only reads
    -- expiry + identity; cookie swapping happens server-side.
    super_admin_session jsonb NOT NULL,
    target_session jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX impersonation_sessions_admin_idx
  ON public.impersonation_sessions (super_admin_user_id);
CREATE INDEX impersonation_sessions_target_idx
  ON public.impersonation_sessions (target_user_id);
CREATE INDEX impersonation_sessions_expires_idx
  ON public.impersonation_sessions (expires_at);

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only (bypasses RLS); anon/authenticated have no grants.

REVOKE ALL ON TABLE public.impersonation_sessions FROM anon;
REVOKE ALL ON TABLE public.impersonation_sessions FROM authenticated;
GRANT ALL ON TABLE public.impersonation_sessions TO service_role;
