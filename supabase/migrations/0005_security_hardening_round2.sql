-- ============================================================================
-- 0005_security_hardening_round2.sql
-- Audit remediation round 2 (2026-08-04) — applies on top of 0004.
--
-- Fixes:
--   1. CRITICAL: projects.created_by — abandoned-project takeover.
--      staff_insert_first_owner let ANY authenticated user claim ANY project
--      with zero members (project_has_no_members) and become its owner.
--      Now the project must carry created_by = auth.uid().
--   2. CRITICAL: ALTER DEFAULT PRIVILEGES still auto-granted ALL to
--      anon/authenticated on every FUTURE table/sequence/function.
--      0001/0002 patched per-object; the defaults were the re-opener.
--   3. HIGH: orders UPDATE policy allowed editing ANY column (e.g.
--      service_type, total_amount). Client only ever writes `status` —
--      restrict UPDATE to that column.
--   4. HIGH: super_admins had no RLS (bypassed policies entirely).
--   5. LOW: order_seq sequence grant to anon/authenticated (dead legacy).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Abandoned-project takeover: add created_by to projects
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

-- Backfill from existing owner memberships (safe: only touches rows that
-- already have an owner). New projects must set created_by explicitly.
UPDATE public.projects p
SET created_by = sm.user_id
FROM public.staff_members sm
WHERE sm.project_id = p.id
  AND sm.role = 'owner'
  AND p.created_by IS NULL;

-- The old policy let any authenticated user self-insert as owner of ANY
-- memberless project. Require the project to be owned-by-the-creator.
DROP POLICY IF EXISTS staff_insert_first_owner ON public.staff_members;
CREATE POLICY staff_insert_first_owner ON public.staff_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND project_has_no_members(project_id)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.created_by = auth.uid()
    )
  );
COMMENT ON POLICY staff_insert_first_owner ON public.staff_members IS
  'Only the creator of an empty project may self-insert as first owner';

-- handle_new_user_safety (trigger) also creates projects for users created
-- outside the API — stamp created_by there too.
CREATE OR REPLACE FUNCTION public.handle_new_user_safety() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  user_full_name text;
  base_slug text;
  final_slug text;
  new_project_id uuid;
  suffix int := 0;
begin
  -- Only act if this user has no staff_members yet (lightweight check)
  if exists (
    select 1 from public.staff_members where user_id = new.id
  ) then
    return new;
  end if;

  -- Skip if user came through our main API (set from_api=true in user_metadata)
  if new.raw_user_meta_data ? 'from_api' and new.raw_user_meta_data->>'from_api' = 'true' then
    return new;
  end if;

  -- Only create project for users created outside the API (e.g. Supabase dashboard)
  user_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'متجري'
  );

  base_slug := public.generate_basic_slug(user_full_name);

  -- Ensure unique slug (lightweight loop)
  final_slug := base_slug;
  while exists (select 1 from public.projects where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix;
  end loop;

  -- Create a minimal project
  insert into public.projects (name, slug, currency, primary_color, is_active, created_by)
  values (
    user_full_name,
    final_slug,
    'BHD',
    '#4338CA',
    true,
    new.id
  )
  returning id into new_project_id;

  -- Create owner membership
  insert into public.staff_members (project_id, user_id, role)
  values (new_project_id, new.id, 'owner');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Kill the default-privilege backdoor on FUTURE objects
-- ---------------------------------------------------------------------------
-- These run for the two roles that create objects in this database.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. orders: restrict authenticated UPDATE to the status column
--    (kitchen + POS only ever write status; everything else is service_role)
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.orders FROM authenticated;
GRANT UPDATE (status) ON TABLE public.orders TO authenticated;
-- INSERT/SELECT/DELETE grants from the baseline remain untouched.

-- ---------------------------------------------------------------------------
-- 4. super_admins: enable RLS (was policy-less; any authenticated user could
--    read/insert into it). Only service_role / SECURITY DEFINER access now.
-- ---------------------------------------------------------------------------
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.super_admins FROM anon;
REVOKE ALL ON TABLE public.super_admins FROM authenticated;
GRANT ALL ON TABLE public.super_admins TO service_role;

-- ---------------------------------------------------------------------------
-- 5. order_seq: revoke anon/authenticated (dead legacy sequence)
-- ---------------------------------------------------------------------------
REVOKE ALL ON SEQUENCE public.order_seq FROM anon;
REVOKE ALL ON SEQUENCE public.order_seq FROM authenticated;

-- ---------------------------------------------------------------------------
-- 6. order_items: enforce product belongs to the SAME project as its order.
--    The RLS policy only checks the member belongs to the order's project;
--    nothing stopped a member from adding a product priced/owned by ANOTHER
--    tenant (arbitrary unit_price / cross-tenant price leak). This trigger
--    makes it impossible regardless of the write path (PostgREST or direct).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_validate_project() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_order_project uuid;
  v_product_project uuid;
begin
  -- Resolve the order's project and (when present) the product's project.
  select project_id into v_order_project
  from public.orders where id = NEW.order_id;

  if v_order_project is null then
    raise exception 'order_items: order % not found', NEW.order_id;
  end if;

  if NEW.product_id is not null then
    select project_id into v_product_project
    from public.products where id = NEW.product_id;

    if v_product_project is null then
      raise exception 'order_items: product % not found', NEW.product_id;
    end if;

    if v_product_project <> v_order_project then
      raise exception 'order_items: product belongs to a different project';
    end if;
  end if;

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_order_items_validate_project ON public.order_items;
CREATE TRIGGER trg_order_items_validate_project
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_validate_project();
