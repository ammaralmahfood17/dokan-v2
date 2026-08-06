-- ============================================================================
-- 0019_subscription_cutoff_hard.sql
-- Close the ~24h revenue-leak window: the public menu + public order API
-- previously checked only projects.is_active, which pg_cron flips at 03:00
-- daily. A store whose subscription expired at 10:00 stayed live until the
-- next 03:00 cron run (~17h of free service).
--
-- Fix: expose a SECURITY DEFINER RPC that reads subscription_expires_at
-- directly (anon has column-scoped grants on projects — 0006 — and cannot
-- select that column). The public menu page and /api/public/order now call
-- this RPC; the cutoff is exact to the minute, independent of the cron.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_project_publicly_available(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_is_active boolean;
  v_expires timestamptz;
begin
  select is_active, subscription_expires_at
    into v_is_active, v_expires
    from public.projects
   where slug = p_slug;

  -- Unknown slug → false. Inactive → false. Trial/expiry missing → false
  -- (fail closed — a store without an expiry should never serve orders).
  if v_is_active is null then
    return false;
  end if;

  return v_is_active
     and v_expires is not null
     and v_expires > now();
end;
$$;

-- anon needs to call it from the public menu page.
GRANT ALL ON FUNCTION public.is_project_publicly_available(text) TO anon;
GRANT ALL ON FUNCTION public.is_project_publicly_available(text) TO authenticated;
