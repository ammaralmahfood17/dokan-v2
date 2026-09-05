-- Security advisor hardening for the fresh Dokan deployment.
-- RLS helper functions intentionally remain executable because policies call
-- them; trigger-only functions and internal tables are explicitly locked down.

BEGIN;

-- Make the function's namespace deterministic.
CREATE OR REPLACE FUNCTION public.generate_basic_slug(input text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(input, ''));
  s := translate(
    s,
    'أإآاابتثجحخدذرزسشصضطظعغفقكلمنهويةىئؤء٠١٢٣٤٥٦٧٨٩',
    'aaaabtthjkhddrzsssdttaghfqklmnhwyayyuw000000000'
  );
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');
  IF s = '' OR s IS NULL THEN
    s := 'store-' || substr(md5(random()::text), 1, 6);
  END IF;
  RETURN left(s, 48);
END;
$$;

-- These functions are invoked by database triggers, not by PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.enqueue_order_created_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_items_validate_project() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_auto_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_core_module_toggle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_posted_journal_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_unbalanced_posting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_journal_currency() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_order_created_event() TO service_role;

-- Explicit default-deny policies document the intended posture for internal
-- tables and remove ambiguity from database security advisors. service_role
-- bypasses RLS and remains the only application-side worker role.
CREATE POLICY daily_order_counters_deny_client ON public.daily_order_counters
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY event_outbox_deny_client ON public.event_outbox
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY impersonation_sessions_deny_client ON public.impersonation_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY rate_limits_deny_client ON public.rate_limits
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY super_admin_audit_log_deny_client ON public.super_admin_audit_log
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY super_admins_deny_client ON public.super_admins
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- unaccent is not referenced by the application or migrations after the
-- baseline. Keep extensions outside public so they are not exposed through
-- the API schema.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION unaccent SET SCHEMA extensions;

COMMIT;
