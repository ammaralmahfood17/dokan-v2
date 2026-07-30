-- ============================================================================
-- Migration 0021 — Public storefront RPC for /[slug]
-- ============================================================================
-- businesses/branches have no anon SELECT policy (by design — see
-- businesses_staff_select in 0002_rls_policies.sql), so the new general
-- storefront page (distinct from the per-table /m/[code] QR flow) needs its
-- own SECURITY DEFINER RPC, same pattern as get_menu_by_qr. Only ever
-- exposes businesses with status = 'active', and only active branches /
-- service locations within them.
-- ============================================================================

create or replace function public.get_business_storefront_by_slug(p_slug text)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'logo_url', b.logo_url,
    'default_locale', b.default_locale,
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', br.id,
        'name', br.name,
        'address', br.address,
        'service_locations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'label', sl.label,
            'type', sl.type,
            'code', qc.code
          ) order by sl.label)
          from service_locations sl
          join qr_codes qc on qc.service_location_id = sl.id and qc.is_active = true
          where sl.branch_id = br.id and sl.is_active = true
        ), '[]'::jsonb)
      ) order by br.name)
      from branches br
      where br.business_id = b.id and br.is_active = true
    ), '[]'::jsonb)
  )
  from businesses b
  where b.slug = p_slug and b.status = 'active';
$$;

revoke all on function public.get_business_storefront_by_slug(text) from public;
grant execute on function public.get_business_storefront_by_slug(text) to anon, authenticated;
