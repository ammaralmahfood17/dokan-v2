-- ============================================================================
-- DOKAN — Fix: include product modifiers in the public menu RPC
-- ============================================================================
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
        'is_available', p.is_available,
        'modifier_groups', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', g.id, 'name_ar', g.name_ar, 'is_required', g.is_required, 'max_select', g.max_select,
            'modifiers', (
              select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name_ar', m.name_ar, 'price_delta', m.price_delta) order by m.sort_order), '[]')
              from product_modifiers m where m.group_id = g.id and m.is_available = true
            )
          ) order by g.sort_order), '[]')
          from product_modifier_groups g where g.product_id = p.id
        )
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
