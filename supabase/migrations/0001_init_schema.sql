-- ============================================================================
-- DOKAN — Core Schema (Multi-tenant SaaS for food trucks / small food biz)
-- ============================================================================
-- Design principles:
--   * Shared DB, tenant-scoped rows (business_id / branch_id everywhere)
--   * Every tenant table has RLS ON, no exceptions
--   * Never trust client-provided tenant IDs — always derive from auth.uid()
--   * Customers are NEVER authenticated users. Public order flow uses
--     branch_id + table_id embedded in the QR code + short-lived order tokens.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type app_role as enum ('super_admin', 'owner', 'manager', 'staff');
create type business_status as enum ('pending', 'active', 'suspended');
create type order_channel as enum ('table', 'takeaway', 'car', 'manual');
create type order_status as enum ('new', 'preparing', 'ready', 'completed', 'cancelled');
create type plan_interval as enum ('monthly', 'yearly');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');
create type notification_type as enum ('call_staff', 'bill_request', 'new_order', 'system');

-- ----------------------------------------------------------------------------
-- USERS (mirrors auth.users, one row per authenticated user: owner/manager/staff/super_admin)
-- Customers do NOT get a row here.
-- ----------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ACCOUNTS — billing/owner root. One account can own multiple businesses.
-- ----------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index idx_accounts_owner on public.accounts(owner_id);

-- ----------------------------------------------------------------------------
-- BUSINESSES
-- ----------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  slug text not null unique,
  status business_status not null default 'pending',
  logo_url text,
  default_locale text not null default 'ar',
  currency text not null default 'BHD',
  tax_rate numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_businesses_account on public.businesses(account_id);
create index idx_businesses_status on public.businesses(status);

-- ----------------------------------------------------------------------------
-- BRANCHES
-- ----------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_branches_business on public.branches(business_id);

-- ----------------------------------------------------------------------------
-- STAFF MEMBERS — join table: user <-> business (+ optional branch scoping) + role
-- ----------------------------------------------------------------------------
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- null = all branches
  role app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, business_id, branch_id)
);
create index idx_staff_user on public.staff_members(user_id);
create index idx_staff_business on public.staff_members(business_id);

-- ----------------------------------------------------------------------------
-- SERVICE LOCATIONS (tables / car slots / takeaway counters)
-- ----------------------------------------------------------------------------
create table public.service_locations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  label text not null,                 -- "Table 7", "Car Slot 2"
  type order_channel not null default 'table',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_service_locations_branch on public.service_locations(branch_id);

-- ----------------------------------------------------------------------------
-- QR CODES — maps a scanned code to branch + optional service_location
-- ----------------------------------------------------------------------------
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_location_id uuid references public.service_locations(id) on delete cascade,
  code text not null unique,           -- random token embedded in the QR URL
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_qr_branch on public.qr_codes(branch_id);
create unique index idx_qr_code on public.qr_codes(code);

-- ----------------------------------------------------------------------------
-- CATEGORIES
-- ----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- null = shared across branches
  name_ar text not null,
  name_en text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_categories_business on public.categories(business_id);

-- ----------------------------------------------------------------------------
-- PRODUCTS
-- ----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- null = shared
  category_id uuid references public.categories(id) on delete set null,
  name_ar text not null,
  name_en text,
  description_ar text,
  description_en text,
  price numeric(10,3) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_business on public.products(business_id);
create index idx_products_category on public.products(category_id);
create index idx_products_available on public.products(is_available);

-- ----------------------------------------------------------------------------
-- PRODUCT MODIFIERS / VARIANTS (e.g. "Size: Large +0.500", "No sugar")
-- ----------------------------------------------------------------------------
create table public.product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_ar text not null,
  name_en text,
  is_required boolean not null default false,
  max_select int not null default 1,
  sort_order int not null default 0
);
create index idx_modgroups_product on public.product_modifier_groups(product_id);

create table public.product_modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_modifier_groups(id) on delete cascade,
  name_ar text not null,
  name_en text,
  price_delta numeric(10,3) not null default 0,
  is_available boolean not null default true,
  sort_order int not null default 0
);
create index idx_modifiers_group on public.product_modifiers(group_id);

-- ----------------------------------------------------------------------------
-- ORDERS — QR orders and manual staff orders share this exact pipeline
-- ----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_location_id uuid references public.service_locations(id) on delete set null,
  order_number text not null,          -- human-friendly, per-branch daily sequence e.g. "D-116"
  channel order_channel not null default 'table',
  status order_status not null default 'new',
  customer_name text,                  -- optional, only if provided
  customer_note text,
  subtotal numeric(10,3) not null default 0,
  tax_amount numeric(10,3) not null default 0,
  total numeric(10,3) not null default 0,
  created_by_staff_id uuid references public.staff_members(id), -- null = customer QR order
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_business on public.orders(business_id);
create index idx_orders_branch_created on public.orders(branch_id, created_at desc);
create index idx_orders_status on public.orders(branch_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,   -- freeze name at order time
  unit_price_snapshot numeric(10,3) not null,
  quantity int not null check (quantity > 0),
  modifiers_snapshot jsonb not null default '[]', -- [{name, price_delta}]
  line_total numeric(10,3) not null,
  note text
);
create index idx_order_items_order on public.order_items(order_id);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS (call staff / bill requests / new order pings)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_location_id uuid references public.service_locations(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  type notification_type not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_branch on public.notifications(branch_id, is_resolved);

-- ----------------------------------------------------------------------------
-- PLANS & SUBSCRIPTIONS (platform billing, managed by super_admin)
-- ----------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null,
  interval plan_interval not null default 'monthly',
  max_branches int not null default 1,
  max_products int not null default 100,
  features jsonb not null default '[]',
  is_active boolean not null default true
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status subscription_status not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);
create index idx_subscriptions_business on public.subscriptions(business_id);

-- ----------------------------------------------------------------------------
-- AUDIT LOGS
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_business on public.audit_logs(business_id, created_at desc);
