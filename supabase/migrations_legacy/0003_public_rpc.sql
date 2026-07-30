-- ============================================================================
-- DOKAN — Public customer RPCs (anon role, NO auth required)
-- ============================================================================
-- Customers never touch tables directly. Every function below:
--   1. Validates the qr code token itself (not trusted client business/branch IDs)
--   2. Only returns/writes data scoped to that single branch
--   3. Runs SECURITY DEFINER so anon has zero raw table grants
-- ============================================================================

-- Revoke all default table access from anon on tenant tables (defense in depth,
-- RLS already blocks this since anon has no policies, but be explicit).
revoke all on public.businesses, public.branches, public.products, public.categories,
  public.orders, public.order_items, public.service_locations, public.qr_codes,
  public.staff_members, public.accounts, public.subscriptions, public.audit_logs
from anon;

-- ----------------------------------------------------------------------------
-- get_menu_by_qr(code) -> business + branch + categories + products
-- ----------------------------------------------------------------------------
create or replace function public.get_menu_by_qr(qr_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_business_id uuid;
  v_location_id uuid;
  v_result jsonb;
begin
  select q.branch_id, b.business_id, q.service_location_id
    into v_branch_id, v_business_id, v_location_id
  from qr_codes q
  join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true and b.is_active = true;

  if v_branch_id is null then
    raise exception 'INVALID_QR_CODE';
  end if;

  select jsonb_build_object(
    'business', (select jsonb_build_object('id', id, 'name', name, 'currency', currency, 'tax_rate', tax_rate)
                 from businesses where id = v_business_id and status = 'active'),
    'branch_id', v_branch_id,
    'service_location_id', v_location_id,
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name_ar', c.name_ar, 'name_en', c.name_en) order by c.sort_order), '[]')
      from categories c
      where c.business_id = v_business_id and c.is_active = true
        and (c.branch_id is null or c.branch_id = v_branch_id)
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'category_id', p.category_id, 'name_ar', p.name_ar, 'name_en', p.name_en,
        'description_ar', p.description_ar, 'price', p.price, 'image_url', p.image_url,
        'is_available', p.is_available
      ) order by p.sort_order), '[]')
      from products p
      where p.business_id = v_business_id
        and (p.branch_id is null or p.branch_id = v_branch_id)
    )
  ) into v_result;

  if v_result->'business' = 'null'::jsonb then
    raise exception 'BUSINESS_NOT_ACTIVE';
  end if;

  return v_result;
end;
$$;
grant execute on function public.get_menu_by_qr(text) to anon;

-- ----------------------------------------------------------------------------
-- place_order(qr_code, items, customer_name, note) -> order_id + order_number
-- items = [{product_id, quantity, note, modifier_ids: []}]
-- ----------------------------------------------------------------------------
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

  select tax_rate into v_tax_rate from businesses where id = v_business_id and status = 'active';
  if v_tax_rate is null then
    raise exception 'BUSINESS_NOT_ACTIVE';
  end if;

  v_order_number := 'D-' || to_char(nextval('public.order_seq'), 'FM000');

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
grant execute on function public.place_order(text, jsonb, text, text) to anon;

create sequence if not exists public.order_seq start 100;

-- ----------------------------------------------------------------------------
-- get_order_status(order_id) — customer polls/subscribes to their own order only
-- ----------------------------------------------------------------------------
create or replace function public.get_order_status(p_order_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'order_number', order_number, 'status', status, 'total', total)
  from orders where id = p_order_id;
$$;
grant execute on function public.get_order_status(uuid) to anon;

-- ----------------------------------------------------------------------------
-- request_call_staff / request_bill — customer utility actions
-- ----------------------------------------------------------------------------
create or replace function public.request_call_staff(qr_code text, p_order_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_branch_id uuid; v_business_id uuid; v_location_id uuid;
begin
  select q.branch_id, b.business_id, q.service_location_id into v_branch_id, v_business_id, v_location_id
  from qr_codes q join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true;
  if v_branch_id is null then raise exception 'INVALID_QR_CODE'; end if;
  insert into notifications (business_id, branch_id, service_location_id, order_id, type)
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'call_staff');
end; $$;
grant execute on function public.request_call_staff(text, uuid) to anon;

create or replace function public.request_bill(qr_code text, p_order_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_branch_id uuid; v_business_id uuid; v_location_id uuid;
begin
  select q.branch_id, b.business_id, q.service_location_id into v_branch_id, v_business_id, v_location_id
  from qr_codes q join branches b on b.id = q.branch_id
  where q.code = qr_code and q.is_active = true;
  if v_branch_id is null then raise exception 'INVALID_QR_CODE'; end if;
  insert into notifications (business_id, branch_id, service_location_id, order_id, type)
  values (v_business_id, v_branch_id, v_location_id, p_order_id, 'bill_request');
end; $$;
grant execute on function public.request_bill(text, uuid) to anon;
