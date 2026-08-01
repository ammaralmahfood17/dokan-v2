-- ============================================================================
-- 0054: Actually lock down next_order_number
-- ============================================================================
-- 0053 revoked from anon,authenticated but that did NOT close the hole:
-- Postgres grants EXECUTE to PUBLIC by default, and every role (including
-- anon/authenticated) is implicitly a member of PUBLIC. The effective revoke
-- is `from public`; then re-grant to service_role (the admin client's role)
-- so the order APIs keep working.
-- ============================================================================

revoke execute on function public.next_order_number(uuid) from public;
grant execute on function public.next_order_number(uuid) to service_role;
