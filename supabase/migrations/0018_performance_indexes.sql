-- ============================================================================
-- DOKAN — Performance Indexes (2026-07-14)
-- T-03: Add missing indexes that make RLS helper functions fast at scale.
--
-- Without these, every RLS policy evaluation that calls
--   staff_role_for_business(), staff_business_ids(), has_branch_access()
-- does a sequential scan of staff_members. At 10k+ rows this causes
-- noticeable latency on every authenticated request.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- staff_members: the single most queried table (every RLS helper hits it)
-- ----------------------------------------------------------------------------
-- Used by: staff_role_for_business(), staff_business_ids()
create index if not exists idx_staff_members_user_business_active
  on public.staff_members (user_id, business_id, is_active)
  where is_active = true;

-- Used by: has_branch_access()
create index if not exists idx_staff_members_user_branch
  on public.staff_members (user_id, branch_id)
  where is_active = true;

-- ----------------------------------------------------------------------------
-- orders: dashboard + kitchen queries always filter by business/branch + status
-- ----------------------------------------------------------------------------
create index if not exists idx_orders_business_created
  on public.orders (business_id, created_at desc);

create index if not exists idx_orders_branch_status_active
  on public.orders (branch_id, status)
  where status not in ('completed', 'cancelled');

-- ----------------------------------------------------------------------------
-- notifications: real-time dashboard polls by branch + resolved state
-- NOTE: The column is `is_resolved` (boolean), NOT `is_read`.
--       Defined in 0001_init_schema.sql line:
--         is_resolved boolean not null default false
-- ----------------------------------------------------------------------------
create index if not exists idx_notifications_branch_resolved
  on public.notifications (branch_id, is_resolved, created_at desc);

create index if not exists idx_notifications_business_created
  on public.notifications (business_id, created_at desc);

-- ----------------------------------------------------------------------------
-- products: menu page always filters by business + is_available
-- ----------------------------------------------------------------------------
create index if not exists idx_products_business_available
  on public.products (business_id, is_available)
  where is_available = true;

-- ----------------------------------------------------------------------------
-- subscriptions: place_order() + dashboard checks active subscription
-- NOTE: Column is `ends_at` — check 0017 migration which adds it.
--       If your DB still uses `current_period_end` (original schema),
--       replace ends_at with current_period_end below.
-- ----------------------------------------------------------------------------
create index if not exists idx_subscriptions_business_status
  on public.subscriptions (business_id, status);

-- ----------------------------------------------------------------------------
-- qr_codes: place_order() / get_order_status_by_qr() look up by code
-- A unique index already exists (idx_qr_code) from 0001_init_schema.sql,
-- this partial index speeds up the is_active = true filter used in every RPC.
-- ----------------------------------------------------------------------------
create index if not exists idx_qr_codes_code_active
  on public.qr_codes (code)
  where is_active = true;
