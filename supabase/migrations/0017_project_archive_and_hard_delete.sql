-- ============================================================================
-- 0017_project_archive_and_hard_delete.sql
-- Phase D — manual project create/archive/hard-delete (super-admin only).
--
-- DESIGN:
-- - Soft-delete is the DEFAULT: deleted_at timestamp makes the project
--   invisible to staff (getCurrentProject guard) and hidden from listings.
--   Data is retained; a mistaken archive is recoverable by clearing the flag.
-- - Hard-delete is deliberately separate and harder: a dedicated RPC (the UI
--   requires typing the exact project name + a reason). All child rows are
--   removed by existing ON DELETE CASCADE FKs.
-- - Both RPCs are SECURITY DEFINER with the in-function super-admin check
--   (same pattern as renew_subscription / super_admin_deactivate_project).
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Soft-delete (archive). Reason is REQUIRED (stored in audit by the route).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_archive_project(
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

    if not exists (select 1 from public.super_admins sa where sa.user_id = v_caller) then
        raise exception 'super admin only' using errcode = '42501';
    end if;

    update public.projects
    set deleted_at = now(),
        is_active = false
    where id = p_project_id
      and deleted_at is null;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        raise exception 'project not found or already archived' using errcode = 'P0002';
    end if;

    return true;
end;
$$;

REVOKE ALL ON FUNCTION public.super_admin_archive_project FROM public;
GRANT EXECUTE ON FUNCTION public.super_admin_archive_project TO service_role;

-- ---------------------------------------------------------------------------
-- Hard-delete. Destructive by design — UI requires exact-name confirmation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_hard_delete_project(
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

    if not exists (select 1 from public.super_admins sa where sa.user_id = v_caller) then
        raise exception 'super admin only' using errcode = '42501';
    end if;

    -- All child rows cascade (FKs defined ON DELETE CASCADE in baseline).
    delete from public.projects
    where id = p_project_id;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        raise exception 'project not found' using errcode = 'P0002';
    end if;

    return true;
end;
$$;

REVOKE ALL ON FUNCTION public.super_admin_hard_delete_project FROM public;
GRANT EXECUTE ON FUNCTION public.super_admin_hard_delete_project TO service_role;
