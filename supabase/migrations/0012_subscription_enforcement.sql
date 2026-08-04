-- ============================================================================
-- 0012_subscription_enforcement.sql
-- Phase 2 — manual cash subscription enforcement (C1):
--   1. subscription_expires_at timestamptz on projects (default 30-day trial)
--   2. expire_subscriptions() — idempotent flipper run by pg_cron daily
--   3. renew_subscription() — owner-only manual renewal (cash collected)
--   4. pg_cron job registration (runs 03:00 daily)
--   5. Drop dead schema: sync_business_subscription_status() (references a
--      `businesses` table that never existed) + the three unused enums
--      subscription_status / plan_interval / business_status (verified: no
--      column or policy references them — the pg_dump baseline only defines
--      them and the dead function's body).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column + 30-day trial default for existing AND new projects.
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN subscription_expires_at timestamptz
  DEFAULT (now() + interval '30 days') NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Idempotent expiry flipper. SECURITY DEFINER so pg_cron (postgres role)
--    and service_role can both invoke it safely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_count int;
begin
  update public.projects
  set is_active = false
  where is_active = true
    and subscription_expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

REVOKE ALL ON FUNCTION public.expire_subscriptions() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Manual renewal (cash collected by the owner). Owner-only: the caller
--    must be an 'owner' staff member of the project (or a super admin).
--    Sets subscription_expires_at forward from max(now, current expiry) and
--    re-activates the store.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_subscription(
  p_project_id uuid,
  p_days integer DEFAULT 30,
  p_caller_user_id uuid DEFAULT NULL
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_caller uuid;
  v_new_expiry timestamptz;
begin
  v_caller := coalesce(auth.uid(), p_caller_user_id);
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Owner of this project, or a global super admin.
  if not (
    exists (
      select 1 from public.staff_members sm
      where sm.project_id = p_project_id
        and sm.user_id = v_caller
        and sm.role = 'owner'
    )
    or exists (
      select 1 from public.super_admins sa
      where sa.user_id = v_caller
    )
  ) then
    raise exception 'owner only' using errcode = '42501';
  end if;

  update public.projects
  set subscription_expires_at =
        greatest(coalesce(subscription_expires_at, now()), now()) + (p_days || ' days')::interval,
      is_active = true
  where id = p_project_id
  returning subscription_expires_at into v_new_expiry;

  if v_new_expiry is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  return v_new_expiry;
end;
$$;

REVOKE ALL ON FUNCTION public.renew_subscription FROM public;
GRANT EXECUTE ON FUNCTION public.renew_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscription TO service_role;

-- ---------------------------------------------------------------------------
-- 4. pg_cron daily job at 03:00 server time. Registration runs inside the
--    migration, so a failure here fails the whole push loudly (never a
--    silently-unregistered job).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
begin
  -- Re-create cleanly if re-run
  if exists (select 1 from cron.job where jobname = 'dokan-expire-subscriptions') then
    perform cron.unschedule('dokan-expire-subscriptions');
  end if;
  perform cron.schedule(
    'dokan-expire-subscriptions',
    '0 3 * * *',
    'select public.expire_subscriptions();'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Drop dead schema (verified unused — see header).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sync_business_subscription_status();
DROP TYPE IF EXISTS public.subscription_status;
DROP TYPE IF EXISTS public.plan_interval;
DROP TYPE IF EXISTS public.business_status;
