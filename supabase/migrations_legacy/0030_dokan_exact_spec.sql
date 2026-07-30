-- Dokan Exact Schema Migration (per spec)
-- Run this to align DB to the required structure

create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type order_type as enum ('dinein','walkin','drivethru');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending','preparing','ready','delivered','cancelled');
exception when duplicate_object then null; end $$;

-- Projects
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

-- Branches
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true
);

-- Tables (with slug + qrcode)
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  number integer not null,
  slug text not null,
  qrcode text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Mandatory per spec
alter table public.tables add column if not exists slug text;
update public.tables set slug = 'table-' || number where slug is null or slug = '';
alter table public.tables alter column slug set not null;
create unique index if not exists tables_project_slug_unique on public.tables(project_id, slug);

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  name_en text,
  sort_order integer not null default 0
);

-- Products
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
  sort_order integer not null default 0
);

-- Product Addons
create table if not exists public.product_addons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric(10,3) not null default 0,
  is_available boolean not null default true
);

-- Orders
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

-- Order Items (addons as JSONB)
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric(10,3) not null,
  addons jsonb default '[]'::jsonb,
  notes text
);

-- Staff Members
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- Indexes
create index if not exists idx_tables_project_slug on public.tables(project_id, slug);
create index if not exists idx_products_project on public.products(project_id);
create index if not exists idx_orders_project on public.orders(project_id);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_staff_project on public.staff_members(project_id);

-- RLS (basic - will be tightened)
alter table public.projects enable row level security;
alter table public.branches enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_addons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.staff_members enable row level security;

-- Staff can access their project data
create policy "staff_access_projects" on public.projects for all using (
  exists (select 1 from public.staff_members where project_id = projects.id and user_id = auth.uid())
);

create policy "staff_access_branches" on public.branches for all using (
  exists (select 1 from public.staff_members where project_id = branches.project_id and user_id = auth.uid())
);

create policy "staff_access_tables" on public.tables for all using (
  exists (select 1 from public.staff_members where project_id = tables.project_id and user_id = auth.uid())
);

create policy "staff_access_categories" on public.categories for all using (
  exists (select 1 from public.staff_members where project_id = categories.project_id and user_id = auth.uid())
);

create policy "staff_access_products" on public.products for all using (
  exists (select 1 from public.staff_members where project_id = products.project_id and user_id = auth.uid())
);

create policy "staff_access_addons" on public.product_addons for all using (
  exists (select 1 from public.products p join public.staff_members s on s.project_id = p.project_id where p.id = product_addons.product_id and s.user_id = auth.uid())
);

create policy "staff_access_orders" on public.orders for all using (
  exists (select 1 from public.staff_members where project_id = orders.project_id and user_id = auth.uid())
);

create policy "staff_access_order_items" on public.order_items for all using (
  exists (select 1 from public.orders o join public.staff_members s on s.project_id = o.project_id where o.id = order_items.order_id and s.user_id = auth.uid())
);

create policy "staff_access_staff" on public.staff_members for select using (user_id = auth.uid());

-- Public read for active projects/tables/products (for menu)
create policy "public_read_active_projects" on public.projects for select using (is_active = true);
create policy "public_read_active_tables" on public.tables for select using (is_active = true);
create policy "public_read_products" on public.products for select using (is_available = true);
create policy "public_read_categories" on public.categories for select using (true);
create policy "public_read_addons" on public.product_addons for select using (is_available = true);

-- Realtime
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;