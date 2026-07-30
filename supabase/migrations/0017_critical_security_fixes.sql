-- ============================================================================
-- DOKAN — Critical Security Fixes (2026-07-14)
-- Addresses 4 critical bugs identified in code review:
--
--   BUG-01: get_order_status leaks any order to any anon caller
--           Frontend calls: get_order_status_by_qr(p_qr_code, p_order_id)
--           This migration drops the old insecure function and creates the
--           correctly-named, ownership-checked version.
--
--   BUG-03: place_order accepts orders even with expired subscription
--
--   BUG-09: orders_staff_insert RLS lets staff bypass RPC price calculation
--
--   BONUS:  request_call_staff / request_bill spam with no order validation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BUG-01 FIX: Secure order-status lookup
-- Drop both the old single-arg version AND any previous attempt at the fix,
-- then create get_order_status_by_qr() which matches the frontend call in
-- src/app/(public)/m/[code]/order/[orderId]/page.tsx:
--   supabase.rpc('get_order_status_by_qr', { p_qr_code: code, p_order_id: orderId })
-- ----------------------------------------------------------------------------
drop function if exists public.get_order_status(uuid);
drop function if exists public.get_order_status(uuid, text);
drop function if exists public.get_order_status_by_qr(text, uuid);

create or replace function public.get_order_status_by_qr(
  p_qr_code  text,
  p_order_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
begin
  -- 1. Validate the QR code and resolve its branch.
  select q.branch_id into v_branch_id
  from qr_codes q
  join branches b on b.id = q.branch_id
  where q.code      = p_qr_code
    and q.is_active = true
    and b.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  -- 2. Return the order only if it belongs to THIS branch.
  --    Returns NULL (not an error) if the order_id is wrong/foreign —
  --    the client shows a loading state until data arrives.
  return (
    select jsonb_build_object(
      'id',           id,
      'order_number', order_number,
      'status',       status,
      'total',        total
    )
    from orders
    where id        = p_order_id
      and branch_id = v_branch_id
  );
end;
$$;

grant execute on function public.get_order_status_by_qr(text, uuid) to anon;

-- ----------------------------------------------------------------------------
-- BUG-03 FIX: place_order — reject when subscription is expired / absent
-- Redefines place_order() to add a subscription guard (step 4) before any
-- sequence or row mutations occur.
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  qr_code       text,
  items         jsonb,
  customer_name text default null,
  customer_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id     uuid;
  v_business_id   uuid;
  v_location_id   uuid;
  v_channel       order_channel;
  v_order_id      uuid;
  v_order_number  text;
  v_subtotal      numeric(10,3) := 0;
  v_tax_rate      numeric(5,2);
  v_tax_amount    numeric(10,3);
  v_total         numeric(10,3);
  v_valid_count   bigint;
  v_total_count   bigint;
begin
  -- 1. Validate QR code → resolve branch / business.
  select q.branch_id, b.business_id, q.service_location_id,
         coalesce(sl.type, 'takeaway')
    into v_branch_id, v_business_id, v_location_id, v_channel
  from qr_codes q
  join branches b on b.id = q.branch_id
  left join service_locations sl on sl.id = q.service_location_id
  where q.code        = qr_code
    and q.is_active   = true
    and b.is_active   = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  -- 2. Cart must not be empty.
  if jsonb_array_length(items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  if jsonb_array_length(items) > 50 then
    raise exception 'TOO_MANY_ITEMS';
  end if;

  -- 3. Business must be active → get tax rate.
  select tax_rate into v_tax_rate
  from businesses
  where id = v_business_id and status = 'active';

  if v_tax_rate is null then
    raise exception 'BUSINESS_NOT_ACTIVE';
  end if;

  -- 4. BUG-03 FIX: Require a valid, non-expired subscription.
  if not exists (
    select 1
    from subscriptions
    where business_id = v_business_id
      and status      = 'active'
      and current_period_end     > now()
  ) then
    raise exception 'SUBSCRIPTION_EXPIRED';
  end if;

  -- 5. Per-branch order number (defined in 0006).
  v_order_number := next_branch_order_number(v_branch_id);

  -- 6. Insert order header.
  insert into orders (
    business_id, branch_id, service_location_id,
    order_number, channel, status,
    customer_name, customer_note
  )
  values (
    v_business_id, v_branch_id, v_location_id,
    v_order_number, v_channel, 'new',
    customer_name, customer_note
  )
  returning id into v_order_id;

  -- 7. Insert order lines (batch — eliminates N+1 loop).
  with item_data as (
    select
      (i.item->>'product_id')::uuid as product_id,
      (i.item->>'quantity')::int    as quantity,
      i.item->>'note'               as note,
      coalesce(i.item->'modifier_ids', '[]'::jsonb) as modifier_ids
    from jsonb_array_elements(items) i(item)
  ),
  product_data as (
    select id.product_id, id.quantity, id.note, id.modifier_ids,
           p.name_ar, p.price
    from item_data id
    join products p on p.id = id.product_id
      and p.business_id  = v_business_id
      and p.is_available = true
      and (p.branch_id is null or p.branch_id = v_branch_id)
  ),
  check_count as (
    select count(*) as cnt from product_data
  ),
  item_count as (
    select count(*) as cnt from item_data
  )
  select cc.cnt, ic.cnt into v_valid_count, v_total_count
  from check_count cc, item_count ic;

  if v_valid_count <> v_total_count then
    raise exception 'PRODUCT_UNAVAILABLE';
  end if;

  with item_data as (
    select
      (i.item->>'product_id')::uuid as product_id,
      (i.item->>'quantity')::int    as quantity,
      i.item->>'note'               as note,
      coalesce(i.item->'modifier_ids', '[]'::jsonb) as modifier_ids
    from jsonb_array_elements(items) i(item)
  ),
  product_data as (
    select id.product_id, id.quantity, id.note, id.modifier_ids,
           p.name_ar, p.price
    from item_data id
    join products p on p.id = id.product_id
      and p.business_id  = v_business_id
      and (p.branch_id is null or p.branch_id = v_branch_id)
  ),
  inserted as (
    insert into order_items (
      order_id, product_id, product_name_snapshot,
      unit_price_snapshot, quantity,
      modifiers_snapshot, line_total, note
    )
    select
      v_order_id,
      pd.product_id, pd.name_ar, pd.price, pd.quantity,
      coalesce((
        select jsonb_agg(jsonb_build_object('name_ar', m.name_ar, 'price_delta', m.price_delta))
        from product_modifiers m
        where m.id = any(select jsonb_array_elements_text(pd.modifier_ids)::uuid)
      ), '[]'),
      (pd.price + coalesce((
        select sum(m.price_delta)
        from product_modifiers m
        where m.id = any(select jsonb_array_elements_text(pd.modifier_ids)::uuid)
      ), 0)) * pd.quantity,
      pd.note
    from product_data pd
    returning line_total
  )
  select coalesce(sum(line_total), 0) into v_subtotal
  from inserted;

  -- 8. Finalize totals.
  v_tax_amount := round(v_subtotal * v_tax_rate / 100, 3);
  v_total      := v_subtotal + v_tax_amount;

  update orders
  set subtotal   = v_subtotal,
      tax_amount = v_tax_amount,
      total      = v_total,
      updated_at = now()
  where id = v_order_id;

  -- 9. Fire new-order notification.
  insert into notifications (
    business_id, branch_id, service_location_id, order_id, type
  )
  values (
    v_business_id, v_branch_id, v_location_id, v_order_id, 'new_order'
  );

  return jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'total',        v_total
  );
end;
$$;

grant execute on function public.place_order(text, jsonb, text, text) to anon;

-- ----------------------------------------------------------------------------
-- BUG-09 FIX: Remove direct INSERT on orders for the 'staff' role.
-- Staff must use place_order() RPC (enforces pricing + subscription check).
-- Owners and managers may still INSERT directly from the dashboard.
-- ----------------------------------------------------------------------------
drop policy if exists "orders_staff_insert"       on public.orders;
drop policy if exists "orders_owner_manager_insert" on public.orders;

create policy "orders_owner_manager_insert" on public.orders for insert
  with check (
    staff_role_for_business(business_id) in ('owner', 'manager')
    or is_super_admin()
  );

-- ----------------------------------------------------------------------------
-- BONUS FIX: request_call_staff / request_bill — validate order ownership
-- Before inserting a notification, confirm the supplied order_id actually
-- belongs to the branch that owns the QR code. Prevents spam attacks where
-- a valid QR code is paired with a foreign or fabricated order_id.
-- ----------------------------------------------------------------------------
create or replace function public.request_call_staff(
  qr_code    text,
  p_order_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id   uuid;
  v_business_id uuid;
  v_location_id uuid;
begin
  select q.branch_id, b.business_id, q.service_location_id
    into v_branch_id, v_business_id, v_location_id
  from qr_codes q
  join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  if p_order_id is not null then
    if not exists (
      select 1 from orders
      where id = p_order_id and branch_id = v_branch_id
    ) then
      raise exception 'ORDER_NOT_FOUND';
    end if;
  end if;

  insert into notifications (
    business_id, branch_id, service_location_id, order_id, type
  )
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'call_staff');
end;
$$;

grant execute on function public.request_call_staff(text, uuid) to anon;

create or replace function public.request_bill(
  qr_code    text,
  p_order_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id   uuid;
  v_business_id uuid;
  v_location_id uuid;
begin
  select q.branch_id, b.business_id, q.service_location_id
    into v_branch_id, v_business_id, v_location_id
  from qr_codes q
  join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  if p_order_id is not null then
    if not exists (
      select 1 from orders
      where id = p_order_id and branch_id = v_branch_id
    ) then
      raise exception 'ORDER_NOT_FOUND';
    end if;
  end if;

  insert into notifications (
    business_id, branch_id, service_location_id, order_id, type
  )
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'bill_request');
end;
$$;

grant execute on function public.request_bill(text, uuid) to anon;
