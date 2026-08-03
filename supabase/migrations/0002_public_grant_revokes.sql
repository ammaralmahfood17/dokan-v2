-- ============================================================================
-- 0002_public_grant_revokes.sql
-- Follow-up to 0001: live prod used `=X` (PUBLIC) grants on functions —
-- NOT the `TO anon` form the squashed baseline showed — so `REVOKE ... FROM
-- anon` in 0001 removed nothing for those. This migration revokes the
-- PUBLIC grants and re-grants EXECUTE only to the roles that legitimately
-- call each function:
--   * is_project_member / is_project_owner / project_has_no_members are
--     invoked INSIDE RLS policy expressions for the authenticated role →
--     authenticated must keep EXECUTE (policies evaluate with the caller's
--     privileges, so removing it would break every authenticated query).
--   * anon never evaluates them (no anon policy calls them) → revoked.
--   * is_super_admin is used by the admin dashboard (authenticated).
--   * Trigger helpers (handle_new_user_safety, orders_protect_amounts,
--     sync_business_subscription_status, update_updated_at) run as the
--     table owner via triggers — no role needs direct EXECUTE.
--   * generate_basic_slug is called server-side via service_role.
-- Also: strip anon from the four legacy tables that live in prod but were
-- missing from the squashed baseline (their RLS requires auth.uid / a
-- project membership, so anon could never pass — but defense-in-depth).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Function PUBLIC grants → role-specific.
-- ---------------------------------------------------------------------------

-- RLS helpers — authenticated + service_role only.
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_has_no_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_has_no_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_has_no_members(uuid) TO service_role;

-- Admin check — authenticated (dashboard) + service_role only.
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;

-- Server-side slug generation — service_role only.
REVOKE ALL ON FUNCTION public.generate_basic_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_basic_slug(text) TO service_role;

-- Trigger helpers — nobody calls these directly.
REVOKE ALL ON FUNCTION public.handle_new_user_safety() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orders_protect_amounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_business_subscription_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Strip anon from the legacy tables missing from the baseline.
--    (Supabase's default event trigger grants ALL to anon on any new table,
--    so newly created super_admins also needs the explicit revoke.)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
REVOKE ALL ON TABLE public.service_requests FROM anon;
REVOKE ALL ON TABLE public.telegram_link_codes FROM anon;
REVOKE ALL ON TABLE public.telegram_links FROM anon;
REVOKE ALL ON TABLE public.super_admins FROM anon;
REVOKE ALL ON TABLE public.super_admins FROM authenticated;
-- telegram_links is read by the dashboard (authenticated) via
-- telegram-manager.tsx — the is_project_member RLS policy gates it.
GRANT SELECT ON TABLE public.telegram_links TO authenticated;
GRANT SELECT ON TABLE public.telegram_links TO service_role;
-- telegram_link_codes: used only server-side (webhook/link API) via
-- service_role. It also holds the one-time pairing codes.
GRANT SELECT, INSERT, DELETE ON TABLE public.telegram_link_codes TO service_role;
GRANT SELECT ON TABLE public.telegram_link_codes TO authenticated;
-- service_requests: legacy waiter/bill flow; authenticated staff may need
-- visibility for audit purposes — SELECT only.
GRANT SELECT ON TABLE public.service_requests TO authenticated;
GRANT SELECT ON TABLE public.service_requests TO service_role;
-- push_subscriptions: written by /api/push/subscribe & /unsubscribe via the
-- USER's session (server client, role = authenticated), and read by the
-- admin push sender (service_role). RLS gates rows to auth.uid() = user_id.
GRANT SELECT, INSERT, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.push_subscriptions TO service_role;
