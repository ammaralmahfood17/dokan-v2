-- ============================================================================
-- 0053: Drop dead legacy RPCs + lock down next_order_number
-- ============================================================================
-- Audit findings (2026-08-01):
--   🔴 5 legacy SECURITY DEFINER functions with anon EXECUTE grants survive in
--      production (place_order, request_call_staff, request_bill,
--      get_order_status_by_qr, subscription_is_valid). They reference the
--      pre-MVP schema renamed to _legacy_* by 0032, so they error at runtime
--      today — BUT any future migration that recreates their dependencies
--      (e.g. a qr_codes table) resurrects them with full definer privileges
--      + anon execution, bypassing ALL RLS and the hardened TS validation.
--   🟡 Dead/manual functions created outside migrations and never called by
--      the app (get_menu_by_qr, get_menu_by_table_slug, get_order_status_public,
--      table_order_count_recent) — Postgres grants PUBLIC execute by default,
--      so they are anonymously reachable. (project_has_no_members is KEPT —
--      it is a live 0033 function used by RLS.)
--   🟡 next_order_number is SECURITY DEFINER and callable by anon — verified
--      live: anon can increment the daily counter (burn order numbers).
--      API routes call it via service_role, so anon/authenticated execute
--      is revoked here.
-- ============================================================================

-- 1. Drop all dead RPCs dynamically by name (signatures vary; some were
--    created manually outside migrations). No cascade: if anything depends
--    on one of these, the migration fails loudly and we investigate.
do $$
declare r record;
begin
  for r in (
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'place_order', 'request_call_staff', 'request_bill',
        'get_order_status_by_qr', 'subscription_is_valid',
        'get_menu_by_qr', 'get_menu_by_table_slug',
        'get_order_status_public', 'table_order_count_recent'
      )
  ) loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

-- 2. Lock down next_order_number — staff-less clients must not burn counters.
revoke execute on function public.next_order_number(uuid) from anon, authenticated;
