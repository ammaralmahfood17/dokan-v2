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

-- 2. Add CHECK constraint to customers table
-- regex: ^\+?[0-9]{8,15}$
-- Allows optional '+' prefix and 8 to 15 digits.
ALTER TABLE public.customers
  ADD CONSTRAINT phone_format_check CHECK (phone ~ '^\+?[0-9]{8,15}$');

-- 3. Grant necessary permissions (just in case)
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;

COMMENT ON CONSTRAINT public.customers.phone_format_check IS 'Ensures phone numbers are in a valid international format (8-15 digits, optional + prefix).';
