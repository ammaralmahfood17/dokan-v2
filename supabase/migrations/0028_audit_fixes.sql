-- ============================================================================
-- Migration 0028 — Audit fixes (Task 1 + Task 2)
-- ============================================================================
-- Fixes identified in the full frontend/backend audit:
--
--   1. place_order rejected status='trialing' — blocked all trial customers
--   2. place_order lost the 5-orders/60s anti-spam throttle from 0009
--   3. request_call_staff / request_bill lost anti-spam from 0009 when
--      rewritten in 0017 (order ownership check was kept, spam guard was not)
--   4. Document that empty 0024/0025 were remote-only; this migration is the
--      single source of truth going forward.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: is the business allowed to accept customer orders?
-- ----------------------------------------------------------------------------
create or replace function public.subscription_is_valid(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.subscriptions
    where business_id = p_business_id
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
  );
$$;

revoke all on function public.subscription_is_valid(uuid) from public;
grant execute on function public.subscription_is_valid(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- place_order — restored anti-spam + accept trialing subscriptions
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
  v_recent_count  int;
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

  -- 2. Cart must not be empty / oversized.
  if jsonb_array_length(items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  if jsonb_array_length(items) > 50 then
    raise exception 'TOO_MANY_ITEMS';
  end if;

  -- 3. Burst protection: max 5 orders from the same table within 60 seconds.
  select count(*) into v_recent_count from orders
  where branch_id = v_branch_id
    and service_location_id is not distinct from v_location_id
    and created_at > now() - interval '60 seconds';
  if v_recent_count >= 5 then
    raise exception 'TOO_MANY_ORDERS';
  end if;

  -- 4. Business must be active → get tax rate.
  select tax_rate into v_tax_rate
  from businesses
  where id = v_business_id and status = 'active';

  if v_tax_rate is null then
    raise exception 'BUSINESS_NOT_ACTIVE';
  end if;

  -- 5. Require a valid subscription (active OR trialing, not expired).
  if not public.subscription_is_valid(v_business_id) then
    raise exception 'SUBSCRIPTION_EXPIRED';
  end if;

  -- 6. Per-branch order number.
  v_order_number := next_branch_order_number(v_branch_id);

  -- 7. Insert order header.
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

  -- 8. Insert order lines (batch CTE — no N+1).
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

  -- 9. Finalize totals.
  v_tax_amount := round(v_subtotal * v_tax_rate / 100, 3);
  v_total      := v_subtotal + v_tax_amount;

  update orders
  set subtotal   = v_subtotal,
      tax_amount = v_tax_amount,
      total      = v_total,
      updated_at = now()
  where id = v_order_id;

  -- 10. Fire new-order notification.
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
-- request_call_staff — anti-spam + order ownership
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
  v_existing    uuid;
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

  -- Anti-spam: one open call_staff per table at a time.
  select id into v_existing from notifications
  where branch_id = v_branch_id
    and service_location_id is not distinct from v_location_id
    and type = 'call_staff'
    and is_resolved = false
  limit 1;

  if v_existing is not null then
    return;
  end if;

  insert into notifications (
    business_id, branch_id, service_location_id, order_id, type
  )
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'call_staff');
end;
$$;

grant execute on function public.request_call_staff(text, uuid) to anon;

-- ----------------------------------------------------------------------------
-- request_bill — anti-spam + order ownership
-- ----------------------------------------------------------------------------
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
  v_existing    uuid;
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

  select id into v_existing from notifications
  where branch_id = v_branch_id
    and service_location_id is not distinct from v_location_id
    and type = 'bill_request'
    and is_resolved = false
  limit 1;

  if v_existing is not null then
    return;
  end if;

  insert into notifications (
    business_id, branch_id, service_location_id, order_id, type
  )
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'bill_request');
end;
$$;

grant execute on function public.request_bill(text, uuid) to anon;
