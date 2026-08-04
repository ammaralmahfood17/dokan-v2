-- ============================================================================
-- 0007_order_transactional_and_number_hardening.sql
-- Audit remediation round 2, third pass (2026-08-04).
--
-- 1. createSecureOrder was NOT transactional: order INSERT then order_items
--    INSERT in two round-trips, with a best-effort DELETE rollback. A crash
--    between the two leaves a member-visible orphan order. Fix: one
--    SECURITY DEFINER RPC that inserts both inside a single transaction.
--    Grants: service_role ONLY (every real-order write path already uses
--    the admin client).
--
-- 2. order_number DoS: orders_staff_insert (authenticated) let any member
--    insert orders with an arbitrary order_number — e.g. the next expected
--    number (breaking the unique index for the whole day) or huge values
--    (burning the sequence range). Fix:
--      a. Column-scoped INSERT grant on orders for authenticated WITHOUT
--         order_number — members physically cannot supply it anymore.
--      b. BEFORE INSERT trigger auto-fills order_number from the atomic
--         next_order_number() when it is still 0 (default) — the auto-fill
--         keeps waiter/bill/kitchen-style inserts working with a real number.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Atomic order + items creation (transactional)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_transactional(
  p_project_id uuid,
  p_table_id uuid,
  p_type text,
  p_status text,
  p_total_amount numeric,
  p_notes text,
  p_order_number integer,
  p_items jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_order_id uuid;
  v_item jsonb;
begin
  insert into public.orders (project_id, table_id, type, status, total_amount, notes, order_number)
  values (p_project_id, p_table_id, p_type::order_type, p_status, p_total_amount, p_notes, p_order_number)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, addons, notes)
    values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      coalesce(v_item->'addons', '[]'::jsonb),
      v_item->>'notes'
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'status', p_status,
    'total_amount', p_total_amount,
    'order_number', p_order_number
  );
end;
$$;

REVOKE ALL ON FUNCTION public.create_order_transactional FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_transactional TO service_role;
-- The order_items_validate_project trigger (0005) still fires inside this
-- RPC, so cross-project product smuggling is blocked on this path too.

-- ---------------------------------------------------------------------------
-- 2. order_number hardening
-- ---------------------------------------------------------------------------
-- (a) authenticated can no longer write the order_number column at all.
REVOKE INSERT ON TABLE public.orders FROM authenticated;
GRANT INSERT (project_id, table_id, type, status, total_amount, notes, service_type, created_at)
  ON TABLE public.orders TO authenticated;

-- (b) auto-fill order_number when it is left at its 0 default, so member
--     inserts (waiter/bill/kitchen flows) still get a real sequential number.
CREATE OR REPLACE FUNCTION public.orders_auto_number() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
begin
  -- Only real orders (service_type IS NULL) need a sequential number;
  -- waiter/bill zero-amount service rows use order_number = 0 on purpose.
  if NEW.service_type is null and NEW.order_number = 0 then
    NEW.order_number := public.next_order_number(NEW.project_id);
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_orders_auto_number ON public.orders;
CREATE TRIGGER trg_orders_auto_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_auto_number();
