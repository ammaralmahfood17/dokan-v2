-- ============================================================================
-- DOKAN — Fix: prevent call_staff / request_bill spam
-- ============================================================================
-- A customer repeatedly tapping "call staff" previously created a new
-- unresolved notification row every time, flooding the KDS alert bar and
-- beeping repeatedly. Now: if an unresolved notification of the same type
-- already exists for that service_location, we no-op instead of inserting
-- a duplicate. Staff resolving it (is_resolved = true) re-opens the ability
-- to call again.
-- ============================================================================

create or replace function public.request_call_staff(qr_code text, p_order_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_business_id uuid;
  v_location_id uuid;
  v_existing uuid;
begin
  select q.branch_id, b.business_id, q.service_location_id into v_branch_id, v_business_id, v_location_id
  from qr_codes q join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true;
  if v_branch_id is null then raise exception 'INVALID_QR_CODE'; end if;

  select id into v_existing from notifications
  where branch_id = v_branch_id
    and service_location_id is not distinct from v_location_id
    and type = 'call_staff'
    and is_resolved = false
  limit 1;

  if v_existing is not null then
    return; -- already an open request for this table — don't spam a second one
  end if;

  insert into notifications (business_id, branch_id, service_location_id, order_id, type)
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'call_staff');
end; $$;

create or replace function public.request_bill(qr_code text, p_order_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_business_id uuid;
  v_location_id uuid;
  v_existing uuid;
begin
  select q.branch_id, b.business_id, q.service_location_id into v_branch_id, v_business_id, v_location_id
  from qr_codes q join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true;
  if v_branch_id is null then raise exception 'INVALID_QR_CODE'; end if;

  select id into v_existing from notifications
  where branch_id = v_branch_id
    and service_location_id is not distinct from v_location_id
    and type = 'bill_request'
    and is_resolved = false
  limit 1;

  if v_existing is not null then
    return;
  end if;

  insert into notifications (business_id, branch_id, service_location_id, order_id, type)
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'bill_request');
end; $$;

-- Also throttle place_order itself: block a burst of more than 5 orders from
-- the same table within 60 seconds (misclick/spam protection, not a hard
-- business limit — staff can still see and cancel any bad order manually).
create or replace function public.place_order(
  qr_code text,
  items jsonb,
  customer_name text default null,
  customer_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_business_id uuid;
  v_location_id uuid;
  v_channel order_channel;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(10,3) := 0;
  v_tax_rate numeric(5,2);
  v_tax_amount numeric(10,3);
  v_total numeric(10,3);
  v_recent_count int;
  item jsonb;
  v_product record;
  v_line_total numeric(10,3);
  v_mod_total numeric(10,3);
begin
  select q.branch_id, b.business_id, q.service_location_id, coalesce(sl.type, 'takeaway')
    into v_branch_id, v_business_id, v_location_id, v_channel
  from qr_codes q
  join branches b on b.id = q.branch_id
  left join service_locations sl on sl.id = q.service_location_id
  where q.code = qr_code and q.is_active = true and b.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  if jsonb_array_length(items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  select count(*) into v_recent_count from orders
  where branch_id = v_branch_id
    and service_location_id is not distinct from v_location_id
    and created_at > now() - interval '60 seconds';
  if v_recent_count >= 5 then
    raise exception 'TOO_MANY_ORDERS';
  end if;

  select tax_rate into v_tax_rate from businesses where id = v_business_id and status = 'active';
  if v_tax_rate is null then
    raise exception 'BUSINESS_NOT_ACTIVE';
  end if;

  v_order_number := next_branch_order_number(v_branch_id);

  insert into orders (business_id, branch_id, service_location_id, order_number, channel, status, customer_name, customer_note)
  values (v_business_id, v_branch_id, v_location_id, v_order_number, v_channel, 'new', customer_name, customer_note)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(items)
  loop
    select id, name_ar, price into v_product
    from products
    where id = (item->>'product_id')::uuid
      and business_id = v_business_id
      and is_available = true
      and (branch_id is null or branch_id = v_branch_id);

    if v_product.id is null then
      raise exception 'PRODUCT_UNAVAILABLE: %', item->>'product_id';
    end if;

    v_mod_total := coalesce((
      select sum(price_delta) from product_modifiers
      where id in (select jsonb_array_elements_text(coalesce(item->'modifier_ids', '[]'::jsonb)))::uuid[]
    ), 0);

    v_line_total := (v_product.price + v_mod_total) * (item->>'quantity')::int;
    v_subtotal := v_subtotal + v_line_total;

    insert into order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, modifiers_snapshot, line_total, note)
    values (
      v_order_id, v_product.id, v_product.name_ar, v_product.price, (item->>'quantity')::int,
      coalesce((
        select jsonb_agg(jsonb_build_object('name_ar', name_ar, 'price_delta', price_delta))
        from product_modifiers where id in (select jsonb_array_elements_text(coalesce(item->'modifier_ids', '[]'::jsonb)))::uuid[]
      ), '[]'),
      v_line_total,
      item->>'note'
    );
  end loop;

  v_tax_amount := round(v_subtotal * v_tax_rate / 100, 3);
  v_total := v_subtotal + v_tax_amount;

  update orders set subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total, updated_at = now()
  where id = v_order_id;

  insert into notifications (business_id, branch_id, service_location_id, order_id, type)
  values (v_business_id, v_branch_id, v_location_id, v_order_id, 'new_order');

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', v_total);
end;
$$;
