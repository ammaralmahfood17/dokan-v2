-- ============================================================================
-- 0056: Fix order_number unique index — scope by day
-- ============================================================================
-- 0042 numbers orders DAILY (counter resets per day via daily_order_counters),
-- but 0046's "safety net" unique index was built on (project_id, order_number)
-- WITHOUT the day. Verified live (2026-08-01): the first order of a new day
-- gets number 1 from the fresh counter and collides with the number-1 order
-- of the previous day → 23505 → "فشل إنشاء الطلب". Order creation was broken
-- for the first order of every day since 0046 shipped.
-- Fix: include the order's day in the unique key.
-- ============================================================================

drop index if exists idx_orders_project_number_unique;
create unique index idx_orders_project_number_unique
  on public.orders (project_id, ((created_at at time zone 'UTC')::date), order_number)
  where service_type is null;
