-- ============================================================================
-- DOKAN MVP cutover — archive legacy schema, install exact product schema
-- Safe: legacy tables renamed (not dropped). App uses only the new tables.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Archive legacy tables that collide with MVP names
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  legacy_tables text[] := array[
    'order_items',
    'orders',
    'product_modifiers',
    'product_modifier_groups',
    'products',
    'categories',
    'qr_codes',
    'service_locations',
    'branches',
    'staff_members',
    'notifications',
    'payments',
    'subscriptions',
    'businesses',
    'accounts',
    'audit_logs',
    'push_subscriptions',
    'plans',
    'super_admins',
    'profiles',
    'users'
  ];
begin
  foreach t in array legacy_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) and not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = '_legacy_' || t
    ) then
      execute format('alter table public.%I rename to %I', t, '_legacy_' || t);
    end if;
  end loop;
end $$;

-- Rename conflicting enums so we can recreate MVP enums
do $$ begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'public' and t.typname = 'order_status')
     and not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                     where n.nspname = 'public' and t.typname = '_legacy_order_status') then
    alter type public.order_status rename to _legacy_order_status;
  end if;
exception when others then null;
end $$;

do $$ begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'public' and t.typname = 'order_channel')
     and not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                     where n.nspname = 'public' and t.typname = '_legacy_order_channel') then
    alter type public.order_channel rename to _legacy_order_channel;
  end if;
exception when others then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. MVP ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.order_type as enum ('dinein', 'walkin', 'drivethru');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('pending', 'preparing', 'ready', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 3. PROJECTS
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'BHD',
  primary_color text not null default '#4338CA',
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_slug on public.projects (slug);

-- ----------------------------------------------------------------------------
-- 4. BRANCHES
-- ----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_branches_project on public.branches (project_id);

-- ----------------------------------------------------------------------------
-- 5. TABLES
-- ----------------------------------------------------------------------------
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  number integer not null,
  slug text,
  qrcode text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tables add column if not exists slug text;
update public.tables set slug = 'table-' || number where slug is null or slug = '';
alter table public.tables alter column slug set not null;
create unique index if not exists tables_project_slug_unique on public.tables (project_id, slug);
create index if not exists idx_tables_branch on public.tables (branch_id);
create index if not exists idx_tables_project on public.tables (project_id);

-- ----------------------------------------------------------------------------
-- 6. CATEGORIES
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  name_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_project on public.categories (project_id);

-- ----------------------------------------------------------------------------
-- 7. PRODUCTS
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  name_en text,
  description text,
  price numeric(10, 3) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_project on public.products (project_id);
create index if not exists idx_products_category on public.products (category_id);

-- ----------------------------------------------------------------------------
-- 8. PRODUCT ADDONS
-- ----------------------------------------------------------------------------
create table if not exists public.product_addons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  price numeric(10, 3) not null default 0 check (price >= 0),
  is_available boolean not null default true
);

create index if not exists idx_addons_product on public.product_addons (product_id);

-- ----------------------------------------------------------------------------
-- 9. ORDERS
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  table_id uuid references public.tables (id) on delete set null,
  type public.order_type not null default 'dinein',
  status public.order_status not null default 'pending',
  total_amount numeric(10, 3) not null default 0 check (total_amount >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_project on public.orders (project_id);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_created on public.orders (created_at desc);

-- ----------------------------------------------------------------------------
-- 10. ORDER ITEMS
-- ----------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(10, 3) not null check (unit_price >= 0),
  addons jsonb not null default '[]'::jsonb,
  notes text
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- 11. STAFF MEMBERS
-- ----------------------------------------------------------------------------
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists idx_staff_project on public.staff_members (project_id);
create index if not exists idx_staff_user on public.staff_members (user_id);

-- ----------------------------------------------------------------------------
-- 12. RLS HELPERS
-- ----------------------------------------------------------------------------
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members sm
    where sm.project_id = p_project_id and sm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members sm
    where sm.project_id = p_project_id
      and sm.user_id = auth.uid()
      and sm.role = 'owner'
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated, anon;
grant execute on function public.is_project_owner(uuid) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 13. ENABLE RLS
-- ----------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.branches enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_addons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.staff_members enable row level security;

-- Drop any leftover policies on these tables
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'projects','branches','tables','categories','products',
        'product_addons','orders','order_items','staff_members'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- PROJECTS
create policy "projects_select_member"
  on public.projects for select
  using (public.is_project_member(id) or is_active = true);

create policy "projects_insert_authenticated"
  on public.projects for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "projects_update_member"
  on public.projects for update
  using (public.is_project_member(id));

create policy "projects_delete_owner"
  on public.projects for delete
  using (public.is_project_owner(id));

-- BRANCHES
create policy "branches_select"
  on public.branches for select
  using (public.is_project_member(project_id) or is_active = true);

create policy "branches_write"
  on public.branches for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- TABLES
create policy "tables_select"
  on public.tables for select
  using (public.is_project_member(project_id) or is_active = true);

create policy "tables_write"
  on public.tables for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- CATEGORIES
create policy "categories_select"
  on public.categories for select
  using (true);

create policy "categories_write"
  on public.categories for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- PRODUCTS
create policy "products_select"
  on public.products for select
  using (public.is_project_member(project_id) or is_available = true);

create policy "products_write"
  on public.products for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- ADDONS
create policy "addons_select"
  on public.product_addons for select
  using (
    is_available = true
    or exists (
      select 1 from public.products p
      where p.id = product_addons.product_id
        and public.is_project_member(p.project_id)
    )
  );

create policy "addons_write"
  on public.product_addons for all
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

-- ORDERS (staff only — public inserts via service role API)
create policy "orders_staff_all"
  on public.orders for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy "order_items_staff_all"
  on public.order_items for all
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_project_member(o.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_project_member(o.project_id)
    )
  );

-- STAFF
create policy "staff_select_own_or_owner"
  on public.staff_members for select
  using (user_id = auth.uid() or public.is_project_owner(project_id));

create policy "staff_insert_self"
  on public.staff_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "staff_update_owner"
  on public.staff_members for update
  using (public.is_project_owner(project_id));

create policy "staff_delete_owner"
  on public.staff_members for delete
  using (public.is_project_owner(project_id));

-- ----------------------------------------------------------------------------
-- 14. REALTIME
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 15. GRANTS
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.projects, public.branches, public.tables,
  public.categories, public.products, public.product_addons to anon, authenticated;
grant select, insert, update, delete on public.projects, public.branches,
  public.tables, public.categories, public.products, public.product_addons,
  public.orders, public.order_items, public.staff_members to authenticated;
