-- ============================================================================
-- 0055: order_number text → integer (0042's intent, never actually applied)
-- ============================================================================
-- Audit finding: migration 0042 intended to convert orders.order_number to
-- integer, but `add column if not exists order_number integer` silently no-ops
-- when the column already exists (it has existed as TEXT since 0001). Live
-- schema confirmed: format=text. All stored values are numeric strings
-- (default 0 + sequential integers from next_order_number), so the cast is
-- safe. Consequences of the text column: lexicographic ordering ("10" < "9")
-- if anything ever orders by order_number, and TS code must String()/Number()
-- round-trip. Convert now.
-- ============================================================================

alter table public.orders
  alter column order_number type integer using order_number::integer;
