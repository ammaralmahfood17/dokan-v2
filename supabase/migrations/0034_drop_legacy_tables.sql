-- ============================================================================
-- Phase 4: Drop Legacy Tables (SAFE - after full verification)
-- ============================================================================
-- WARNING: Only run this AFTER:
--   1. All data has been verified migrated to new tables
--   2. Production backup taken
--   3. At least 7 days of no issues in prod
--
-- This migration drops the _legacy_* tables created in 0032.
-- It also drops legacy types.
-- ============================================================================

-- Drop legacy tables (if they exist)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE '_legacy_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
    RAISE NOTICE 'Dropped legacy table: %', t;
  END LOOP;
END $$;

-- Drop legacy types (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '_legacy_order_status') THEN
    DROP TYPE public._legacy_order_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '_legacy_order_channel') THEN
    DROP TYPE public._legacy_order_channel;
  END IF;
END $$;

COMMENT ON SCHEMA public IS 'Dokan SaaS - Legacy tables dropped (Phase 4 cleanup). New schema only.';
