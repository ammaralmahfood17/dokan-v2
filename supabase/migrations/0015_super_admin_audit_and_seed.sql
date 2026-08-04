-- ============================================================================
-- 0015_super_admin_audit_and_seed.sql
-- Super Admin dashboard — Phase A foundation:
--   1. super_admin_audit_log table (separate from order_audit_logs, which is
--      order-specific with a CHECK constraint — not extendable).
--   2. super_admin_deactivate_project RPC (super-admin-only, same guard
--      pattern as renew_subscription: SECURITY DEFINER + internal check).
--   3. Seed Ammar's accounts as super_admins (table was empty).
--
-- SECURITY: super_admin_audit_log is service_role-only (REVOKE from
-- anon/authenticated, GRANT service_role) — same posture as super_admins.
-- RLS enabled with NO policies: the table is written via service-role RPCs /
-- routes only, and read only by the super-admin surface (service role).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Audit log table
-- ---------------------------------------------------------------------------
CREATE TABLE public.super_admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    action text NOT NULL,
    target_project_id uuid,
    target_user_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX super_admin_audit_log_created_at_idx
  ON public.super_admin_audit_log (created_at DESC);
CREATE INDEX super_admin_audit_log_actor_idx
  ON public.super_admin_audit_log (actor_user_id);
CREATE INDEX super_admin_audit_log_action_idx
  ON public.super_admin_audit_log (action);
CREATE INDEX super_admin_audit_log_project_idx
  ON public.super_admin_audit_log (target_project_id);

ALTER TABLE public.super_admin_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; anon/authenticated have no grants.

REVOKE ALL ON TABLE public.super_admin_audit_log FROM anon;
REVOKE ALL ON TABLE public.super_admin_audit_log FROM authenticated;
GRANT ALL ON TABLE public.super_admin_audit_log TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Deactivate RPC (abuse / non-payment before natural expiry).
--    Super-admin-only, checked INSIDE the function (auth.uid() OR explicit
--    caller id — same coalesce pattern as renew_subscription).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_deactivate_project(
    p_project_id uuid,
    p_caller_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
    v_caller uuid;
    v_updated int;
begin
    v_caller := coalesce(auth.uid(), p_caller_user_id);
    if v_caller is null then
        raise exception 'not authenticated' using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.super_admins sa
        where sa.user_id = v_caller
    ) then
        raise exception 'super admin only' using errcode = '42501';
    end if;

    update public.projects
    set is_active = false
    where id = p_project_id;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        raise exception 'project not found' using errcode = 'P0002';
    end if;

    return true;
end;
$$;

REVOKE ALL ON FUNCTION public.super_admin_deactivate_project FROM public;
GRANT EXECUTE ON FUNCTION public.super_admin_deactivate_project TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Seed Ammar's accounts (table was empty — 0 rows verified).
-- ---------------------------------------------------------------------------
INSERT INTO public.super_admins (user_id)
SELECT id FROM auth.users
WHERE email IN ('ammaralmahfood17@gmail.com', 'teatime@bh.com')
ON CONFLICT (user_id) DO NOTHING;
