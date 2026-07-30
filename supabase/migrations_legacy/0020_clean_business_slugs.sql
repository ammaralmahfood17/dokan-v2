-- ============================================================================
-- Migration 0020 — Clean up business slugs for URL-based multi-tenant routing
-- ============================================================================
-- Slugs used to be generated as "name-<uid fragment>-<timestamp>", which is
-- unusable in a public/dashboard URL. Now that /[slug] and /[slug]/dashboard
-- are real routes, regenerate clean slugs from the business name, keeping
-- them unique with a numeric suffix only on actual collisions.
-- Safe to run on pre-launch data; if this ever runs against real traffic,
-- old links using the previous slug will 404 — acceptable one-time cost.
-- ============================================================================

create extension if not exists unaccent;

do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in select id, name from public.businesses order by created_at loop
    base := lower(regexp_replace(unaccent(r.name), '[^a-z0-9\u0600-\u06FF]+', '-', 'g'));
    base := trim(both '-' from base);
    if base = '' then
      base := 'store';
    end if;

    candidate := base;
    n := 1;

    while exists (
      select 1 from public.businesses
      where slug = candidate and id <> r.id
    ) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;

    update public.businesses set slug = candidate where id = r.id;
  end loop;
end $$;
