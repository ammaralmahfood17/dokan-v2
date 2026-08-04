-- ============================================================================
-- 0008_fix_create_order_type_cast.sql
-- Fix: create_order_transactional (0007) declared p_type as text but the
-- orders.type column is an enum (order_type) — every call failed with
-- "column type is of type order_type but expression is of type text".
-- Recreate the function with the cast.
-- ============================================================================

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
