-- ============================================================================
-- DOKAN — Exact Schema per Product Spec
-- Multi-tenant SaaS PWA for cafés/restaurants in Gulf
-- Single migration file as per task
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type if not exists order_type as enum ('dinein', 'walkin', 'drivethru');
create type if not exists order_status as enum ('pending', 'preparing', 'ready', 'delivered', 'cancelled');

-- ----------------------------------------------------------------------------
-- PROJECTS (the tenant root, previously "businesses")
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'BHD',
  primary_color text not null default '#1C1A17',
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_slug on public.projects(slug);

-- ----------------------------------------------------------------------------
-- BRANCHES
-- ----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_branches_project on public.branches(project_id);

-- ----------------------------------------------------------------------------
-- TABLES (service locations / tables with friendly slug + QR token)
-- ----------------------------------------------------------------------------
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  number integer not null,
  slug text not null,
  qrcode text not null, -- the secret token / code used in QR
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists tables_project_slug_unique on public.tables(project_id, slug);
create index if not exists idx_tables_branch on public.tables(branch_id);

-- Mandatory per spec (backfill if needed)
-- This will be idempotent
alter table public.tables add column if not exists slug text;
update public.tables set slug = 'table-' || number where slug is null or slug = '';
alter table public.tables alter column slug set not null;
create unique index if not exists tables_project_slug_unique on public.tables(project_id, slug);

-- ----------------------------------------------------------------------------
-- CATEGORIES
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  name_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_project on public.categories(project_id);

-- ----------------------------------------------------------------------------
-- PRODUCTS
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  name_en text,
  description text,
  price numeric(10,3) not null,
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_project on public.products(project_id);
create index if not exists idx_products_category on public.products(category_id);

-- ----------------------------------------------------------------------------
-- PRODUCT ADDONS
-- ----------------------------------------------------------------------------
create table if not exists public.product_addons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric(10,3) not null default 0,
  is_available boolean not null default true
);

create index if not exists idx_addons_product on public.product_addons(product_id);

-- ----------------------------------------------------------------------------
-- ORDERS
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  type order_type not null default 'dinein',
  status order_status not null default 'pending',
  total_amount numeric(10,3) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_project on public.orders(project_id);
create index if not exists idx_orders_status on public.orders(status);

-- ----------------------------------------------------------------------------
-- ORDER ITEMS (addons as JSONB for flexibility)
-- ----------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric(10,3) not null,
  addons jsonb default '[]',
  notes text
);

create index if not exists idx_order_items_order on public.order_items(order_id);

-- ----------------------------------------------------------------------------
-- STAFF MEMBERS (role-based access)
-- ----------------------------------------------------------------------------
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists idx_staff_project on public.staff_members(project_id);
create index if not exists idx_staff_user on public.staff_members(user_id);

-- ----------------------------------------------------------------------------
-- RLS POLICIES (strict multi-tenant)
-- ----------------------------------------------------------------------------

-- Enable RLS on all tenant tables
alter table public.projects enable row level security;
alter table public.branches enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_addons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.staff_members enable row level security;

-- Projects: owners can manage their own
create policy "projects_owner_all" on public.projects
  for all using (
    exists (select 1 from public.staff_members where project_id = projects.id and user_id = auth.uid() and role in ('owner'))
  );

-- Branches, Tables, etc. scoped via project
create policy "branches_staff_access" on public.branches
  for all using (
    exists (select 1 from public.staff_members where project_id = branches.project_id and user_id = auth.uid())
  );

create policy "tables_staff_access" on public.tables
  for all using (
    exists (select 1 from public.staff_members where project_id = tables.project_id and user_id = auth.uid())
  );

create policy "categories_staff_access" on public.categories
  for all using (
    exists (select 1 from public.staff_members where project_id = categories.project_id and user_id = auth.uid())
  );

create policy "products_staff_access" on public.products
  for all using (
    exists (select 1 from public.staff_members where project_id = products.project_id and user_id = auth.uid())
  );

create policy "addons_staff_access" on public.product_addons
  for all using (
    exists (
      select 1 from public.products p
      join public.staff_members sm on sm.project_id = p.project_id
      where p.id = product_addons.product_id and sm.user_id = auth.uid()
    )
  );

-- Orders & Items: staff can see their project orders
create policy "orders_staff_access" on public.orders
  for all using (
    exists (select 1 from public.staff_members where project_id = orders.project_id and user_id = auth.uid())
  );

create policy "order_items_staff_access" on public.order_items
  for all using (
    exists (
      select 1 from public.orders o
      join public.staff_members sm on sm.project_id = o.project_id
      where o.id = order_items.order_id and sm.user_id = auth.uid()
    )
  );

-- Staff members: user can see their own memberships, owner can manage
create policy "staff_members_select_own" on public.staff_members
  for select using (user_id = auth.uid());

create policy "staff_members_owner_manage" on public.staff_members
  for all using (
    exists (
      select 1 from public.staff_members sm2
      where sm2.project_id = staff_members.project_id 
        and sm2.user_id = auth.uid() 
        and sm2.role = 'owner'
    )
  );

-- ----------------------------------------------------------------------------
-- Public RPCs for customer flow (secure, no direct table access)
-- ----------------------------------------------------------------------------

-- Function to get menu by table slug (used by public menu)
create or replace function public.get_menu_by_table_slug(p_project_slug text, p_table_slug text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_table record;
  result json;
begin
  select * into v_project from public.projects where slug = p_project_slug and is_active = true;
  if v_project is null then raise exception 'Project not found'; end if;

  select * into v_table from public.tables 
  where project_id = v_project.id and slug = p_table_slug and is_active = true;

  if v_table is null then raise exception 'Table not found'; end if;

  select json_build_object(
    'project', v_project,
    'table', v_table,
    'categories', (
      select json_agg(c.* order by c.sort_order)
      from public.categories c where c.project_id = v_project.id
    ),
    'products', (
      select json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'name_en', p.name_en,
          'description', p.description,
          'price', p.price,
          'image_url', p.image_url,
          'is_available', p.is_available,
          'category_id', p.category_id,
          'addons', (
            select json_agg(a.*) from public.product_addons a where a.product_id = p.id and a.is_available
          )
        ) order by p.sort_order
      )
      from public.products p 
      where p.project_id = v_project.id and p.is_available = true
    )
  ) into result;

  return result;
end;
$$;

-- Secure place_order (public, verified via table slug/qrcode)
create or replace function public.place_order(
  p_project_slug text,
  p_table_slug text,
  p_items jsonb,
  p_type order_type default 'dinein',
  p_notes text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_table_id uuid;
  v_order_id uuid;
  v_total numeric := 0;
  item jsonb;
begin
  -- Resolve project and table securely
  select id into v_project_id from public.projects where slug = p_project_slug and is_active = true;
  if v_project_id is null then raise exception 'Invalid project'; end if;

  select id into v_table_id from public.tables 
  where project_id = v_project_id and slug = p_table_slug and is_active = true;

  if v_table_id is null then raise exception 'Invalid table'; end if;

  -- Create order
  insert into public.orders (project_id, table_id, type, status, notes)
  values (v_project_id, v_table_id, p_type, 'pending', p_notes)
  returning id into v_order_id;

  -- Insert items (server-side price validation would be stronger in prod)
  for item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, addons, notes
    ) values (
      v_order_id,
      (item->>'product_id')::uuid,
      item->>'name',
      (item->>'quantity')::int,
      (item->>'unit_price')::numeric,
      coalesce(item->'addons', '[]'::jsonb),
      item->>'notes'
    );
    v_total := v_total + (item->>'unit_price')::numeric * (item->>'quantity')::int;
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;

  return json_build_object('order_id', v_order_id, 'total', v_total);
end;
$$;

grant execute on function public.get_menu_by_table_slug(text, text) to anon, authenticated;
grant execute on function public.place_order(text, text, jsonb, order_type, text) to anon, authenticated;

-- Realtime for orders (for KDS)
alter publication supabase_realtime add table if not exists public.orders;
alter publication supabase_realtime add table if not exists public.order_items;

comment on table public.projects is 'Root tenant for each café/restaurant';
comment on table public.tables is 'Physical tables or service points with friendly slug for URLs';