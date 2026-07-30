-- ============================================================================
-- DOKAN — RLS Policies
-- ============================================================================
-- Model:
--   * Authenticated dashboard/staff users -> scoped via staff_members + is_super_admin
--   * Public customers -> NEVER get direct table access. All customer reads/writes
--     go through SECURITY DEFINER RPC functions (see 0003_public_rpc.sql) that
--     validate the qr_codes.code token server-side. This keeps RLS simple and
--     bullet-proof: anon role has ZERO direct grants on tenant tables.
-- ============================================================================

alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.staff_members enable row level security;
alter table public.service_locations enable row level security;
alter table public.qr_codes enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.product_modifiers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.notifications enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, STABLE) — avoid recursive RLS checks
-- ----------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from users where id = auth.uid()), false);
$$;

create or replace function public.staff_business_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select business_id from staff_members
  where user_id = auth.uid() and is_active = true;
$$;

create or replace function public.staff_role_for_business(target_business_id uuid)
returns app_role language sql stable security definer set search_path = public as $$
  select role from staff_members
  where user_id = auth.uid() and business_id = target_business_id and is_active = true
  order by case role
    when 'owner' then 1 when 'manager' then 2 when 'staff' then 3 end
  limit 1;
$$;

create or replace function public.has_branch_access(target_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_members sm
    join branches b on b.id = target_branch_id
    where sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.business_id = b.business_id
      and (sm.branch_id is null or sm.branch_id = target_branch_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------------------
create policy "users_select_self_or_admin" on public.users for select
  using (id = auth.uid() or is_super_admin());
create policy "users_update_self" on public.users for update
  using (id = auth.uid());

-- ----------------------------------------------------------------------------
-- ACCOUNTS
-- ----------------------------------------------------------------------------
create policy "accounts_owner_full" on public.accounts for all
  using (owner_id = auth.uid() or is_super_admin())
  with check (owner_id = auth.uid() or is_super_admin());

-- ----------------------------------------------------------------------------
-- BUSINESSES
-- ----------------------------------------------------------------------------
create policy "businesses_staff_select" on public.businesses for select
  using (id in (select staff_business_ids()) or is_super_admin());
create policy "businesses_owner_write" on public.businesses for insert
  with check (account_id in (select id from accounts where owner_id = auth.uid()) or is_super_admin());
create policy "businesses_owner_update" on public.businesses for update
  using (staff_role_for_business(id) in ('owner') or is_super_admin());
create policy "businesses_super_admin_delete" on public.businesses for delete
  using (is_super_admin());

-- ----------------------------------------------------------------------------
-- BRANCHES
-- ----------------------------------------------------------------------------
create policy "branches_staff_select" on public.branches for select
  using (business_id in (select staff_business_ids()) or is_super_admin());
create policy "branches_owner_manager_write" on public.branches for insert
  with check (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "branches_owner_manager_update" on public.branches for update
  using (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "branches_owner_delete" on public.branches for delete
  using (staff_role_for_business(business_id) = 'owner' or is_super_admin());

-- ----------------------------------------------------------------------------
-- STAFF_MEMBERS
-- ----------------------------------------------------------------------------
create policy "staff_select_own_business" on public.staff_members for select
  using (business_id in (select staff_business_ids()) or user_id = auth.uid() or is_super_admin());
create policy "staff_owner_manager_write" on public.staff_members for insert
  with check (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "staff_owner_manager_update" on public.staff_members for update
  using (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "staff_owner_delete" on public.staff_members for delete
  using (staff_role_for_business(business_id) = 'owner' or is_super_admin());

-- ----------------------------------------------------------------------------
-- SERVICE LOCATIONS / QR CODES / CATEGORIES / PRODUCTS / MODIFIERS
-- (identical pattern: select for staff of the business, write for owner/manager)
-- ----------------------------------------------------------------------------
create policy "service_locations_select" on public.service_locations for select
  using (has_branch_access(branch_id) or is_super_admin());
create policy "service_locations_write" on public.service_locations for insert
  with check (has_branch_access(branch_id) or is_super_admin());
create policy "service_locations_update" on public.service_locations for update
  using (has_branch_access(branch_id) or is_super_admin());
create policy "service_locations_delete" on public.service_locations for delete
  using (has_branch_access(branch_id) or is_super_admin());

create policy "qr_codes_select" on public.qr_codes for select
  using (has_branch_access(branch_id) or is_super_admin());
create policy "qr_codes_write" on public.qr_codes for insert
  with check (has_branch_access(branch_id) or is_super_admin());
create policy "qr_codes_update" on public.qr_codes for update
  using (has_branch_access(branch_id) or is_super_admin());

create policy "categories_select" on public.categories for select
  using (business_id in (select staff_business_ids()) or is_super_admin());
create policy "categories_write" on public.categories for insert
  with check (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "categories_update" on public.categories for update
  using (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "categories_delete" on public.categories for delete
  using (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());

create policy "products_select" on public.products for select
  using (business_id in (select staff_business_ids()) or is_super_admin());
create policy "products_write" on public.products for insert
  with check (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());
create policy "products_update" on public.products for update
  using (staff_role_for_business(business_id) in ('owner','manager','staff') or is_super_admin());
  -- staff can update (e.g. toggle is_available) but not insert/delete
create policy "products_delete" on public.products for delete
  using (staff_role_for_business(business_id) in ('owner','manager') or is_super_admin());

create policy "modifier_groups_all" on public.product_modifier_groups for all
  using (
    product_id in (select id from products where business_id in (select staff_business_ids()))
    or is_super_admin()
  )
  with check (
    product_id in (select id from products where staff_role_for_business(business_id) in ('owner','manager'))
    or is_super_admin()
  );

create policy "modifiers_all" on public.product_modifiers for all
  using (
    group_id in (
      select id from product_modifier_groups where product_id in (
        select id from products where business_id in (select staff_business_ids())
      )
    ) or is_super_admin()
  )
  with check (
    group_id in (
      select id from product_modifier_groups where product_id in (
        select id from products where staff_role_for_business(business_id) in ('owner','manager')
      )
    ) or is_super_admin()
  );

-- ----------------------------------------------------------------------------
-- ORDERS / ORDER ITEMS — staff of the business only (customers use RPC, see 0003)
-- ----------------------------------------------------------------------------
create policy "orders_select" on public.orders for select
  using (business_id in (select staff_business_ids()) or is_super_admin());
create policy "orders_staff_insert" on public.orders for insert
  with check (staff_role_for_business(business_id) in ('owner','manager','staff') or is_super_admin());
create policy "orders_staff_update" on public.orders for update
  using (staff_role_for_business(business_id) in ('owner','manager','staff') or is_super_admin());

create policy "order_items_select" on public.order_items for select
  using (
    order_id in (select id from orders where business_id in (select staff_business_ids()))
    or is_super_admin()
  );
create policy "order_items_staff_insert" on public.order_items for insert
  with check (
    order_id in (
      select id from orders where staff_role_for_business(business_id) in ('owner','manager','staff')
    ) or is_super_admin()
  );

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create policy "notifications_select" on public.notifications for select
  using (business_id in (select staff_business_ids()) or is_super_admin());
create policy "notifications_staff_update" on public.notifications for update
  using (staff_role_for_business(business_id) in ('owner','manager','staff') or is_super_admin());

-- ----------------------------------------------------------------------------
-- PLANS — public read (pricing page), super_admin write
-- ----------------------------------------------------------------------------
create policy "plans_public_select" on public.plans for select using (is_active = true or is_super_admin());
create policy "plans_super_admin_write" on public.plans for insert with check (is_super_admin());
create policy "plans_super_admin_update" on public.plans for update using (is_super_admin());

-- ----------------------------------------------------------------------------
-- SUBSCRIPTIONS
-- ----------------------------------------------------------------------------
create policy "subscriptions_select" on public.subscriptions for select
  using (business_id in (select staff_business_ids()) or is_super_admin());
create policy "subscriptions_super_admin_write" on public.subscriptions for insert with check (is_super_admin());
create policy "subscriptions_super_admin_update" on public.subscriptions for update using (is_super_admin());

-- ----------------------------------------------------------------------------
-- AUDIT LOGS — read-only for owners/managers of their business, full for super_admin
-- ----------------------------------------------------------------------------
create policy "audit_logs_select" on public.audit_logs for select
  using (
    (business_id in (select staff_business_ids()) and staff_role_for_business(business_id) in ('owner','manager'))
    or is_super_admin()
  );
create policy "audit_logs_insert_any_staff" on public.audit_logs for insert
  with check (business_id in (select staff_business_ids()) or is_super_admin());
