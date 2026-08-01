-- ============================================================================
-- 0061: Audit fixes — RLS hardening (backend audit 2026-08-01)
-- ============================================================================
-- Closes findings from Task 2 audit:
--   1. 🔴 anon/authenticated could BURN order numbers via next_order_number
--      (0059 re-granted EXECUTE after 0054's lockdown revoked it)
--   2. 🔴 Cross-tenant catalog leak: any authenticated user could read every
--      active product/category/addon/table/project via `OR is_available/is_active`
--      policies. Split into role-scoped policies:
--        - anon            → public menu data only (is_available/is_active)
--        - authenticated   → own tenant only (is_project_member)
--   3. 🟡 write policies were `for all` without WITH CHECK → member could move
--      rows to another project_id. Split per-command + add WITH CHECK.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Restore next_order_number lockdown
-- ----------------------------------------------------------------------------
revoke execute on function public.next_order_number(uuid) from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Role-scoped SELECT policies (fixes cross-tenant catalog leak)
-- ----------------------------------------------------------------------------

-- PRODUCTS
drop policy if exists products_select on public.products;
create policy products_public_read on public.products
  for select to anon
  using (is_available = true);
create policy products_member_read on public.products
  for select to authenticated
  using (public.is_project_member(project_id));

-- CATEGORIES
drop policy if exists categories_select on public.categories;
create policy categories_public_read on public.categories
  for select to anon
  using (is_active = true);
create policy categories_member_read on public.categories
  for select to authenticated
  using (public.is_project_member(project_id));

-- PRODUCT ADDONS
drop policy if exists addons_select on public.product_addons;
create policy addons_public_read on public.product_addons
  for select to anon
  using (is_available = true);
create policy addons_member_read on public.product_addons
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_addons.product_id
        and public.is_project_member(p.project_id)
    )
  );

-- TABLES
drop policy if exists tables_select on public.tables;
create policy tables_public_read on public.tables
  for select to anon
  using (is_active = true);
create policy tables_member_read on public.tables
  for select to authenticated
  using (public.is_project_member(project_id));

-- PROJECTS (anon sees active projects for slug lookup; members see own project)
drop policy if exists projects_select_member on public.projects;
create policy projects_public_read on public.projects
  for select to anon
  using (is_active = true);
create policy projects_member_read on public.projects
  for select to authenticated
  using (public.is_project_member(id));

-- ----------------------------------------------------------------------------
-- 3) Write policies: per-command, member-only, WITH CHECK on updates
-- ----------------------------------------------------------------------------

-- PRODUCTS
drop policy if exists products_write on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (public.is_project_member(project_id));
create policy products_update on public.products
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy products_delete on public.products
  for delete to authenticated
  using (public.is_project_member(project_id));

-- CATEGORIES
drop policy if exists categories_write on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated
  with check (public.is_project_member(project_id));
create policy categories_update on public.categories
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy categories_delete on public.categories
  for delete to authenticated
  using (public.is_project_member(project_id));

-- TABLES
drop policy if exists tables_write on public.tables;
create policy tables_insert on public.tables
  for insert to authenticated
  with check (public.is_project_member(project_id));
create policy tables_update on public.tables
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy tables_delete on public.tables
  for delete to authenticated
  using (public.is_project_member(project_id));

-- ADDONS
drop policy if exists addons_write on public.product_addons;
create policy addons_insert on public.product_addons
  for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_addons.product_id
        and public.is_project_member(p.project_id)
    )
  );
create policy addons_update on public.product_addons
  for update to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_addons.product_id
        and public.is_project_member(p.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_addons.product_id
        and public.is_project_member(p.project_id)
    )
  );
create policy addons_delete on public.product_addons
  for delete to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_addons.product_id
        and public.is_project_member(p.project_id)
    )
  );
