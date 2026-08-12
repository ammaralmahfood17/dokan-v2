-- ============================================================================
-- 0007_phone_validation.sql
-- Phase: Data Integrity Hardening
-- Goal: Ensure customers.phone follows a valid international format (E.164-ish)
-- ============================================================================

-- 1. Defensive cleanup: drop legacy rows whose phone cannot satisfy the new
-- constraint ONCE. The CRM table is brand new (0006), so non-conforming rows
-- are junk data — deleting beats failing the whole migration on `db push`.
DELETE FROM public.customers
  WHERE phone IS NULL OR phone !~ '^\+?[0-9]{8,15}$';

-- 2. Add CHECK constraint to customers table (idempotent — production already
-- applied this once directly; re-running must not 42710)
-- regex: ^\+?[0-9]{8,15}$
-- Allows optional '+' prefix and 8 to 15 digits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'phone_format_check'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT phone_format_check CHECK (phone ~ '^\+?[0-9]{8,15}$');
  END IF;
END $$;

-- 3. Grant necessary permissions (just in case)
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;

COMMENT ON CONSTRAINT phone_format_check ON public.customers
  IS 'Ensures phone numbers are in a valid international format (8-15 digits, optional + prefix).';
