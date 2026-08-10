-- ============================================================================
-- 0005 — KDS transition guard (TASK 1 security follow-up)
-- ----------------------------------------------------------------------------
-- The kitchen board advances an order forward only:
--   pending -> preparing -> ready -> delivered
-- The existing advance_order_status() RPC was callable directly and only
-- blocked STALE transitions (expected != actual). It did NOT block INVALID
-- transitions (e.g. ready -> pending, or any -> cancelled) — a direct caller
-- could rewind an order's state. Cancellation has its own dedicated,
-- TOCTOU-safe route (POST /api/pos/cancel).
--
-- This migration re-defines the RPC (CREATE OR REPLACE) with an explicit
-- allow-list of valid (expected, new) pairs. Everything else raises
-- INVALID_TRANSITION. The tenant guard + STALE check are preserved verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id uuid,
  p_expected_status text,
  p_new_status text,
  p_caller_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_project_id uuid;
  v_caller uuid;
  v_rows int;
begin
  -- Resolve the order's project — also proves the order exists.
  select project_id into v_project_id
  from public.orders
  where id = p_order_id;

  if v_project_id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Tenant guard: caller (browser auth.uid() or explicit server-passed id)
  -- must be a member of the order's project. Rejects cross-tenant calls and
  -- any future grant widening on this RPC.
  v_caller := coalesce(auth.uid(), p_caller_user_id);
  if v_caller is null or not public.is_project_member_for(v_caller, v_project_id) then
    raise exception 'not authorized for this project' using errcode = '42501';
  end if;

  -- Reject invalid / backward transitions. The kitchen board only ever moves
  -- forward: pending -> preparing -> ready -> delivered. Anything else
  -- (e.g. ready -> pending, or any -> cancelled) is not a valid KDS bump and
  -- must go through the dedicated cancel path (POST /api/pos/cancel), which
  -- re-checks status inside the UPDATE (TOCTOU-safe). Without this guard the
  -- RPC is callable directly and could rewind an order's state.
  if not (
    (p_expected_status, p_new_status) in (
      ('pending', 'preparing'),
      ('preparing', 'ready'),
      ('ready', 'delivered')
    )
  ) then
    raise exception 'INVALID_TRANSITION: % -> %', p_expected_status, p_new_status
      using errcode = 'P0001';
  end if;

  -- Atomic status transition — only advances if the order is exactly in the
  -- expected state (blocks reviving cancelled orders from a stale screen).
  update public.orders
  set status = p_new_status::public.order_status
  where id = p_order_id
    and status = p_expected_status::public.order_status;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'STALE_STATUS: order state changed on another device'
      using errcode = 'P0001';
  end if;

  -- Advance line items in the SAME transaction. order_items.status is text
  -- with CHECK (pending|preparing|ready) — 'delivered' is order-level only,
  -- so items are left at 'ready' on delivery (matches the previous behaviour).
  if p_new_status in ('preparing', 'ready') then
    update public.order_items
    set status = p_new_status
    where order_id = p_order_id;
  end if;

  return jsonb_build_object('id', p_order_id, 'status', p_new_status);
end;
$$;

REVOKE ALL ON FUNCTION public.advance_order_status(uuid, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, text, text, uuid) TO service_role;
