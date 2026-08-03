-- ============================================================================
-- 0003_drop_order_sequences.sql
-- Drop the dead order_sequences table (audit remediation, 2026-08-03).
--
-- Verified dead before dropping:
--   * 0 rows in order_sequences (daily_order_counters holds the live data)
--   * no FK constraints reference it
--   * no functions/triggers reference it
--   * next_order_number() uses daily_order_counters exclusively
--   * no app code reads it (only a generated type def in database.types.ts,
--     which is removed in this change)
-- ============================================================================

DROP TABLE IF EXISTS public.order_sequences;
