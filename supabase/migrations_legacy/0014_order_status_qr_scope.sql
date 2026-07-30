-- ============================================================================
-- Migration 0014 — Scope get_order_status to the scanned QR code
-- ============================================================================
-- Previously get_order_status(p_order_id) let ANY anonymous caller read the
-- status of ANY order just by knowing its UUID. This tightens it: the caller
-- must also present the qr_code that owns the order's branch, so a customer
-- can only track orders they actually scanned. The anon role still has zero
-- direct table access — this is a SECURITY DEFINER RPC.
-- ============================================================================

create or replace function public.get_order_status_by_qr(p_qr_code text, p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_business_id uuid;
begin
  -- Resolve the branch/business the QR code points at (validates the token).
  select q.branch_id, b.business_id
    into v_branch_id, v_business_id
  from qr_codes q
  join branches b on b.id = q.branch_id
  where q.code = p_qr_code and q.is_active = true and b.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  -- Only return the order if it actually belongs to that branch.
  return (
    select jsonb_build_object('id', id, 'order_number', order_number, 'status', status, 'total', total)
    from orders
    where id = p_order_id and branch_id = v_branch_id
  );
end;
$$;

revoke all on function public.get_order_status_by_qr(text, uuid) from public;
grant execute on function public.get_order_status_by_qr(text, uuid) to anon, authenticated;
