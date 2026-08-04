-- ============================================================================
-- 0010_advance_order_status_and_rpc_guards.sql
-- Phase 1 pre-launch fixes (H1+H2 atomic KDS transitions + F1 RPC guards)
--
-- 1. H1/H2: advance_order_status() — ONE transactional, status-checked
--    transition for KDS. Fixes:
--      H1: a stale kitchen screen can no longer revive a cancelled order
--          (UPDATE ... WHERE status = p_expected_status + ROW_COUNT check
--          raising STALE_STATUS).
--      H2: orders.status and order_items.status now advance atomically —
--          no more order-updated/items-stuck window.
-- 2. F1: membership guards inside the three legacy SECURITY DEFINER RPCs
--    (create_order_transactional, next_order_number, rate_limit_check).
--    NOTE: the audit's suggested `IF NOT is_project_member(...)` cannot be
--    used verbatim — is_project_member reads auth.uid(), which is NULL under
--    service_role (the only role these RPCs are callable by). Instead we add
--    an explicit p_caller_user_id parameter and check membership for
--    coalesce(auth.uid(), p_caller_user_id):
--      - browser callers (authenticated): auth.uid() present → real check
--      - server callers (service_role): pass the authenticated staff id →
--        real check
--      - anonymous public order path: caller id is NULL → guard passes
--        (route-level validation + service_role-only EXECUTE still apply)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: membership check for an EXPLICIT user id (unlike is_project_member
-- which only reads auth.uid()). SECURITY DEFINER so internal RPC calls can
-- use it regardless of the caller's table grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_project_member_for(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.staff_members sm
    where sm.project_id = p_project_id and sm.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_member_for(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_project_member_for(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member_for(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- H1/H2: atomic, status-checked KDS order transition.
-- Called from the kitchen client (browser, authenticated) and potentially
-- from server code (service_role + p_caller_user_id).
-- Raises 'STALE_STATUS' when the order is not in the expected state — the
-- client shows "تم تحديث حالة هذا الطلب من جهاز آخر" and refetches.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- F1: guard create_order_transactional.
-- DROP first: CREATE OR REPLACE with an extra parameter would create a NEW
-- overload, leaving the old unguarded signature callable.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order_transactional(uuid, uuid, text, text, numeric, text, integer, jsonb);

CREATE OR REPLACE FUNCTION public.create_order_transactional(
  p_project_id uuid,
  p_table_id uuid,
  p_type text,
  p_status text,
  p_total_amount numeric,
  p_notes text,
  p_order_number integer,
  p_items jsonb,
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
  -- Tenant guard — see header comment. Anonymous public path passes NULL
  -- caller (route-level validation applies); authenticated POS passes the
  -- staff id so the RPC itself enforces membership.
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

-- ---------------------------------------------------------------------------
-- F1: guard next_order_number.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.next_order_number(uuid);

CREATE OR REPLACE FUNCTION public.next_order_number(
  p_project_id uuid,
  p_caller_user_id uuid DEFAULT NULL
) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_next integer;
  v_caller uuid;
begin
  v_caller := coalesce(auth.uid(), p_caller_user_id);
  if v_caller is not null and not public.is_project_member_for(v_caller, p_project_id) then
    raise exception 'not authorized for this project' using errcode = '42501';
  end if;

  insert into public.daily_order_counters (project_id, date, counter)
  values (p_project_id, current_date, 1)
  on conflict (project_id, date)
  do update set counter = daily_order_counters.counter + 1
  returning counter into v_next;

  return v_next;
end;
$$;

REVOKE ALL ON FUNCTION public.next_order_number FROM public;
GRANT EXECUTE ON FUNCTION public.next_order_number TO service_role;

-- ---------------------------------------------------------------------------
-- F1: guard rate_limit_check. This RPC has no project parameter (it is keyed
-- by an opaque string), so the guard fires only when the caller supplies
-- p_project_id — POS passes project+staff id, public routes pass none.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rate_limit_check(text, integer, integer);

CREATE OR REPLACE FUNCTION public.rate_limit_check(
  p_key text,
  p_limit integer,
  p_window_ms integer,
  p_project_id uuid DEFAULT NULL,
  p_caller_user_id uuid DEFAULT NULL
) RETURNS json
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_count int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
  v_remaining int;
  v_reset_in numeric;
  v_caller uuid;
begin
  -- Defense-in-depth: when a project is provided, the caller must be a member.
  if p_project_id is not null then
    v_caller := coalesce(auth.uid(), p_caller_user_id);
    if v_caller is not null and not public.is_project_member_for(v_caller, p_project_id) then
      raise exception 'not authorized for this project' using errcode = '42501';
    end if;
  end if;

  select count, reset_at into v_count, v_reset_at
  from public.rate_limits
  where key = p_key;

  if v_reset_at is null or v_now > v_reset_at then
    insert into public.rate_limits (key, count, reset_at)
    values (p_key, 1, v_now + (p_window_ms || ' milliseconds')::interval)
    on conflict (key) do update
      set count = 1, reset_at = excluded.reset_at;
    return json_build_object('allowed', true, 'remaining', p_limit - 1, 'reset_in', p_window_ms);
  end if;

  if v_count >= p_limit then
    v_reset_in := extract(epoch from (v_reset_at - v_now)) * 1000;
    return json_build_object('allowed', false, 'remaining', 0, 'reset_in', v_reset_in);
  end if;

  update public.rate_limits set count = count + 1 where key = p_key;
  v_remaining := p_limit - v_count - 1;
  v_reset_in := extract(epoch from (v_reset_at - v_now)) * 1000;
  return json_build_object('allowed', true, 'remaining', v_remaining, 'reset_in', v_reset_in);
end;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_check FROM public;
GRANT EXECUTE ON FUNCTION public.rate_limit_check TO service_role;
