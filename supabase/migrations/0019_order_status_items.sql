-- ============================================================================
-- Migration 0019 — Enrich get_order_status_by_qr with items + created_at
-- ============================================================================
-- The customer order-tracking screen only ever showed a status word and the
-- total. This adds the order's line items (name/qty/line_total) and
-- created_at so the UI can show a real progress view of what was ordered.
-- Security scope is unchanged: still gated by the scanned qr_code, still
-- SECURITY DEFINER, still returns null if the order doesn't belong to that
-- branch.
-- ============================================================================

create or replace function public.get_order_status_by_qr(p_qr_code text, p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_business_id uuid;
begin
  select q.branch_id, b.business_id
    into v_branch_id, v_business_id
  from qr_codes q
  join branches b on b.id = q.branch_id
  where q.code = p_qr_code and q.is_active = true and b.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  return (
    select jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total', o.total,
      'created_at', o.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', oi.product_name_snapshot,
          'quantity', oi.quantity,
          'line_total', oi.line_total
        ) order by oi.id)
        from order_items oi
        where oi.order_id = o.id
      ), '[]'::jsonb)
    )
    from orders o
    where o.id = p_order_id and o.branch_id = v_branch_id
  );
end;
$$;

revoke all on function public.get_order_status_by_qr(text, uuid) from public;
grant execute on function public.get_order_status_by_qr(text, uuid) to anon, authenticated;
