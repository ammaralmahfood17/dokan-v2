-- ============================================================================
-- 0047: Security cleanup — fix categories RLS, drop legacy helpers
-- ============================================================================
-- Addresses audit findings:
--   🔴 categories_select USING (true) — no tenant isolation
--   🟡 Orphaned legacy functions (has_branch_access, staff_business_ids, etc.)
--   🟡 Legacy tables (super_admins, profiles)
--   🟢 Unused get_business_storefront_by_slug RPC
-- ============================================================================

-- 1. 🔴 Fix categories_select — scope to project members + public available items
drop policy if exists "categories_select" on public.categories;
create policy "categories_select"
  on public.categories for select
  using (
    public.is_project_member(project_id)
    or exists (
      select 1 from public.products p
      where p.category_id = categories.id and p.is_available = true
    )
  );

-- 2. 🟡 Drop orphaned legacy SECURITY DEFINER helper functions
drop function if exists public.has_branch_access(uuid) cascade;
drop function if exists public.staff_business_ids() cascade;
drop function if exists public.staff_role_for_business(uuid) cascade;
drop function if exists public.handle_new_user() cascade;

-- 3. 🟡 Drop orphaned legacy tables
drop table if exists public.super_admins cascade;
drop table if exists public.profiles cascade;

-- 4. 🟢 Drop unused storefront RPC (references legacy schema)
drop function if exists public.get_business_storefront_by_slug(text) cascade;

-- 5. Review: ensure order_audit_logs RLS covers INSERT grant properly
-- (already done in 0045 — verified here for completeness)
do $$ begin
  -- Ensure authenticated role has INSERT on order_audit_logs
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.rolname = 'authenticated'
    join information_schema.role_table_grants g
      on g.table_name = c.relname
      and g.grantee = 'authenticated'
    where c.relname = 'order_audit_logs'
    and n.nspname = 'public'
    and g.privilege_type = 'INSERT'
  ) then
    grant insert on public.order_audit_logs to authenticated;
  end if;
end $$;

-- 6. ✅ Verifies RLS is enabled on order_audit_logs
do $$ begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'order_audit_logs'
    and n.nspname = 'public'
    and c.relrowsecurity = true
  ) then
    alter table public.order_audit_logs enable row level security;
  end if;
end $$;
