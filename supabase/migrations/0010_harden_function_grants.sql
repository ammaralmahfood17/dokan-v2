-- ============================================================================
-- 0010_harden_function_grants.sql
-- Phase: Backend security review — closes the function-ACL leak + billing clamp
--
-- 1. CRITICAL: `create_order_transactional` was EXECUTE-granted to `anon`
--    (and `authenticated`) via the legacy ALTER DEFAULT PRIVILEGES block and
--    its guard passes for anonymous callers (auth.uid() = NULL) → unauthenticated
--    attackers could forge orders/amounts into any tenant. PROVEN in production.
-- 2. HIGH: `renew_subscription` had no upper bound on p_days → an owner could
--    self-extend indefinitely. Clamp to 1..365 inside the function (authoritative).
-- 3. Defense-in-depth: trim the remaining anon/authenticated EXECUTE grants
--    (super-admin RPCs, is_project_owner_or_manager, is_project_member_for).
-- 4. Guard the default privileges so this class of leak can't recur.
-- ============================================================================

-- 1. Money path: order creation is service_role / route-gated ONLY.
REVOKE EXECUTE ON FUNCTION public.create_order_transactional(uuid, text, text, numeric, integer, jsonb, uuid, text, uuid, text) FROM anon, authenticated;

-- 2. Subscription integrity: clamp p_days (1..365) inside the RPC.
CREATE OR REPLACE FUNCTION public.renew_subscription(p_project_id uuid, p_days integer DEFAULT 30, p_caller_user_id uuid DEFAULT NULL::uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid;
  v_new_expiry timestamptz;
  -- Clamp is authoritative at the DB layer; the API route cap (365) is a mirror.
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
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
        greatest(coalesce(subscription_expires_at, now()), now()) + (v_days || ' days')::interval,
      is_active = true
  where id = p_project_id
  returning subscription_expires_at into v_new_expiry;

  if v_new_expiry is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  return v_new_expiry;
end;
$function$;

-- 3. Residual ACL cleanup — in-function checks already protect these, but
--    anon/authenticated must not be able to invoke them (profiling + surface).
REVOKE EXECUTE ON FUNCTION public.super_admin_deactivate_project(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.super_admin_archive_project(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.super_admin_hard_delete_project(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_project_owner_or_manager(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_member_for(uuid, uuid) FROM authenticated;

-- 4. Never leak new functions to anon/authenticated by default (defensive;
--    the standalone 0004 migration already removed the default grants).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;