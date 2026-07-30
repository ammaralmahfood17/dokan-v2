-- ============================================================================
-- DOKAN — Fix: per-branch order numbering (was a single global sequence)
-- ============================================================================
alter table public.branches add column if not exists next_order_seq int not null default 100;

create or replace function public.next_branch_order_number(p_branch_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_seq int;
begin
  update branches set next_order_seq = next_order_seq + 1
  where id = p_branch_id
  returning next_order_seq into v_seq;

  if v_seq is null then
    raise exception 'BRANCH_NOT_FOUND';
  end if;

  return 'D-' || v_seq::text;
end;
$$;

revoke all on function public.next_branch_order_number(uuid) from public;
grant execute on function public.next_branch_order_number(uuid) to authenticated;
-- anon is granted too, because place_order() (below) runs as SECURITY DEFINER
-- and calls this internally — anon never calls it directly itself.
grant execute on function public.next_branch_order_number(uuid) to anon;

-- Redefine place_order() to use per-branch numbering instead of the old
-- global order_seq sequence.
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

-- The old global sequence + accessor are superseded by the per-branch
-- function above. Kept only so 0005's grants don't dangle; no longer used
-- by any application code path.
drop function if exists public.nextval_order_seq();
