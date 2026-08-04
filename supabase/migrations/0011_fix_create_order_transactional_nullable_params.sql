-- ============================================================================
-- 0011_fix_create_order_transactional_nullable_params.sql
-- The 0010 rewrite of create_order_transactional accidentally dropped the
-- nullable handling of p_table_id / p_notes that the original signature had
-- (callers legitimately pass NULL for table-less POS orders and optional
-- notes). Regenerate the function with DEFAULT NULL on both so the
-- generated client types stay compatible with the existing call sites.
--
-- NOTE: PostgreSQL requires that every parameter AFTER a defaulted one also
-- has a default (SQLSTATE 42P13), so the optional args are moved to the END
-- of the signature. Callers pass these by name (supabase.rpc), so argument
-- order does not affect them.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_order_transactional(uuid, uuid, text, text, numeric, text, integer, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_order_transactional(
  p_project_id uuid,
  p_type text,
  p_status text,
  p_total_amount numeric,
  p_order_number integer,
  p_items jsonb,
  p_table_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_caller_user_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_caller uuid;
begin
  -- Tenant guard — see 0010 header comment. Anonymous public path passes
  -- NULL caller (route-level validation applies); authenticated POS passes
  -- the staff id so the RPC itself enforces membership.
  v_caller := coalesce(auth.uid(), p_caller_user_id);
  if v_caller is not null and not public.is_project_member_for(v_caller, p_project_id) then
    raise exception 'not authorized for this project' using errcode = '42501';
  end if;

  insert into public.orders (project_id, table_id, type, status, total_amount, notes, order_number)
  values (p_project_id, p_table_id, p_type::order_type, p_status::order_status, p_total_amount, p_notes, p_order_number)
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