-- ============================================================================
-- DOKAN — Sequence accessor for staff-created (manual) orders
-- ============================================================================
-- The public.place_order() RPC (0003) already calls nextval('order_seq')
-- internally for QR orders. Manual staff orders are created directly from
-- the authenticated dashboard (not through that RPC), so they need their
-- own safe way to pull the next number — restricted to `authenticated` only,
-- never `anon`, since anonymous customers must always go through place_order.
-- ============================================================================

create or replace function public.nextval_order_seq()
returns bigint
language sql security definer set search_path = public as $$
  select nextval('public.order_seq');
$$;

revoke all on function public.nextval_order_seq() from public;
grant execute on function public.nextval_order_seq() to authenticated;
