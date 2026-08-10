-- ============================================================================
-- 0004_launch_grant_hardening.sql
-- Pre-launch grant/RLS hardening — 2026-08-10 (deep-code audit remediation)
--
-- Closes the audit findings that survived 0001–0003:
--   F1  HIGH  staff can UPDATE/DELETE order_items (incl. total_amount) via REST
--   F2  HIGH  projects UPDATE grant is all-columns — staff could bump
--             subscription_expires_at / flip is_active / rewrite created_by
--   F3  HIGH  catalog write policies are member-scoped — any staff member can
--             add/edit/delete products, categories, tables, addons
--   F4  MED   push_subscriptions policies keyed on user_id only — a former
--             staff member keeps subscriptions → receives order pushes
--   F5  MED   staff_members SELECT/UPDATE-prefs policies lack a positive
--             project-membership clause
--   F6  MED   handle_new_user_safety auto-provisions a full project for ANY
--             raw auth/v1/signup (bypasses /api/auth/signup rate limit);
--             now gated on email_confirmed_at
--   F8  MED   ALTER DEFAULT PRIVILEGES still grants anon/authenticated
--             full DML on every FUTURE table + EXECUTE on future functions
--   F9  MED   authenticated INSERT on orders (client never writes orders —
--             all writes go through service-role routes/RPCs)
--   F12 MED   authenticated DML on order_audit_logs (client history rewrite)
--   F15 LOW   generate_basic_slug caps at 48 vs app generateSlug at 40
--   F17 LOW   orders_staff_update_status lets staff flip status directly,
--             bypassing advance_order_status RPC validation
-- Plus: sum_order_totals aggregate RPC (bounded day-total, replaces an
-- unbounded client-side fetch of every order row of the day).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. F2: projects — column-scoped UPDATE (settings writes only).
-- 0003 revoked INSERT/DELETE; now narrow UPDATE to the 4 settings columns.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.projects FROM authenticated;
GRANT UPDATE (name, currency, primary_color, is_active)
  ON TABLE public.projects TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. F1 + F9 + F12 + F17: orders / order_items / order_audit_logs — the
-- client NEVER writes these tables (every write goes through service-role
-- API routes or SECURITY DEFINER RPCs). Strip DML to SELECT-only for
-- authenticated. This also closes the direct-`cancelled` bypass (F17).
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items FROM authenticated;
REVOKE ALL ON TABLE public.order_audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.order_audit_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. F3: owner/manager-only catalog writes.
-- New helper mirrors is_project_member / is_project_owner conventions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_project_owner_or_manager(p_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members
    WHERE project_id = p_project
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_owner_or_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_owner_or_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner_or_manager(uuid) TO service_role;

-- categories
DROP POLICY IF EXISTS categories_insert ON public.categories;
CREATE POLICY categories_insert ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS categories_update ON public.categories;
CREATE POLICY categories_update ON public.categories
  FOR UPDATE TO authenticated
  USING (public.is_project_owner_or_manager(project_id))
  WITH CHECK (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS categories_delete ON public.categories;
CREATE POLICY categories_delete ON public.categories
  FOR DELETE TO authenticated
  USING (public.is_project_owner_or_manager(project_id));

-- products
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_project_owner_or_manager(project_id))
  WITH CHECK (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete ON public.products
  FOR DELETE TO authenticated
  USING (public.is_project_owner_or_manager(project_id));

-- tables
DROP POLICY IF EXISTS tables_insert ON public.tables;
CREATE POLICY tables_insert ON public.tables
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS tables_update ON public.tables;
CREATE POLICY tables_update ON public.tables
  FOR UPDATE TO authenticated
  USING (public.is_project_owner_or_manager(project_id))
  WITH CHECK (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS tables_delete ON public.tables;
CREATE POLICY tables_delete ON public.tables
  FOR DELETE TO authenticated
  USING (public.is_project_owner_or_manager(project_id));

-- product_addons
DROP POLICY IF EXISTS addons_insert ON public.product_addons;
CREATE POLICY addons_insert ON public.product_addons
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(
    (SELECT project_id FROM public.products WHERE id = product_id)));

DROP POLICY IF EXISTS addons_update ON public.product_addons;
CREATE POLICY addons_update ON public.product_addons
  FOR UPDATE TO authenticated
  USING (public.is_project_owner_or_manager(
    (SELECT project_id FROM public.products WHERE id = product_id)))
  WITH CHECK (public.is_project_owner_or_manager(
    (SELECT project_id FROM public.products WHERE id = product_id)));

DROP POLICY IF EXISTS addons_delete ON public.product_addons;
CREATE POLICY addons_delete ON public.product_addons
  FOR DELETE TO authenticated
  USING (public.is_project_owner_or_manager(
    (SELECT project_id FROM public.products WHERE id = product_id)));

-- ---------------------------------------------------------------------------
-- 4. F4: push_subscriptions — require CURRENT project membership on every
-- operation so former staff can't keep receiving order pushes.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.project_id = push_subscriptions.project_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.project_id = push_subscriptions.project_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.project_id = push_subscriptions.project_id
        AND sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. F5: staff_members — positive membership clause on read + own-prefs
-- update (a row alone used to be enumerable even after leaving the project).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_select_own_or_owner ON public.staff_members;
CREATE POLICY staff_select_own_or_owner ON public.staff_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_owner(project_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.project_id = staff_members.project_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staff_update_own_prefs ON public.staff_members;
CREATE POLICY staff_update_own_prefs ON public.staff_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.project_id = staff_members.project_id
        AND sm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.project_id = staff_members.project_id
        AND sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. F6: handle_new_user_safety — only provision a project for CONFIRMED
-- users. A raw auth/v1/signup (no from_api) used to mint a full project
-- before the email was even confirmed (unlimited store creation, no rate
-- limit). Now: unconfirmed → no project, nothing to abuse.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_safety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  user_full_name text;
  base_slug text;
  final_slug text;
  suffix integer := 0;
  new_project_id uuid;
begin
  -- Never touch existing members
  if exists (
    select 1 from public.staff_members where user_id = new.id
  ) then
    return new;
  end if;

  -- Skip if user came through our main API (set from_api=true in user_metadata)
  if new.raw_user_meta_data ? 'from_api' and new.raw_user_meta_data->>'from_api' = 'true' then
    return new;
  end if;

  -- Only provision for confirmed users (launch hardening): raw signups that
  -- bypass /api/auth/signup stay unconfirmed — no project is minted until
  -- the email is actually confirmed.
  if new.email_confirmed_at is null then
    return new;
  end if;

  -- Only create project for users created outside the API (e.g. Supabase dashboard)
  user_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'متجري'
  );

  base_slug := public.generate_basic_slug(user_full_name);

  -- Ensure unique slug (lightweight loop)
  final_slug := base_slug;
  while exists (select 1 from public.projects where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix;
  end loop;

  -- Create a minimal project
  insert into public.projects (name, slug, currency, primary_color, is_active)
  values (
    user_full_name,
    final_slug,
    'BHD',
    '#4338CA',
    true
  )
  returning id into new_project_id;

  -- Create owner membership
  insert into public.staff_members (project_id, user_id, role)
  values (new_project_id, new.id, 'owner');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. F8: tighten ALTER DEFAULT PRIVILEGES — future objects start locked.
-- Existing objects keep their (already explicit) grants; new tables
-- sequences and functions must be granted deliberately.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;

-- ---------------------------------------------------------------------------
-- 8. Belt & suspenders: TRUNCATE is part of the old blanket grant; drop it
-- for the financial/catalog core (F7 also flags REFERENCES/TRIGGER residue).
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.projects, public.orders,
  public.order_items, public.categories, public.products, public.product_addons,
  public.tables, public.staff_members, public.order_audit_logs, public.push_subscriptions,
  public.telegram_links, public.telegram_link_codes FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8b. F13: drop dead SQL objects (verified unused by app + RPCs).
-- ---------------------------------------------------------------------------
DROP SEQUENCE IF EXISTS public.order_seq;
DROP FUNCTION IF EXISTS public.update_updated_at();
DROP POLICY IF EXISTS projects_delete_owner ON public.projects;

-- ---------------------------------------------------------------------------
-- 8c. F16: make the pgcrypto dependency explicit (tables.qrcode default uses
-- gen_random_bytes; hosted Supabase pre-enables it, fresh bootstraps don't).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 9. F15: align slug cap with the app's generateSlug (40 chars) + fix the
-- volatility lie: the function calls random() in its fallback, so IMMUTABLE
-- was wrong (dangerous if ever used in an expression index).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_basic_slug(input text) RETURNS text
    LANGUAGE plpgsql VOLATILE
    AS $_$
declare
  s text;
begin
  s := lower(coalesce(input, ''));
  -- very rough Arabic to latin (extend as needed)
  s := translate(s,
    'أإآاابتثجحخدذرزسشصضطظعغفقكلمنهويةىئؤء٠١٢٣٤٥٦٧٨٩',
    'aaaabtthjkhddrzsssdttaghfqklmnhwyayyuw000000000');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');
  if s = '' or s is null then
    s := 'store-' || substr(md5(random()::text), 1, 6);
  end if;
  return left(s, 40);
end;
$_$;

-- ---------------------------------------------------------------------------
-- 10. NEW: sum_order_totals — bounded aggregate for the dashboard day-total
-- (replaces the client fetching every order row of the day to sum locally).
-- Same membership gate as the orders SELECT policy: any current member may
-- read totals; only non-cancelled real orders count (mirroring the client).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sum_order_totals(
  p_project uuid,
  p_start timestamptz,
  p_end timestamptz
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if not public.is_project_member(p_project) then
    raise exception 'not a member of this project';
  end if;

  return coalesce((
    select sum(total_amount)
    from public.orders
    where project_id = p_project
      and service_type is null
      and status <> 'cancelled'
      and created_at >= p_start
      and created_at < p_end
  ), 0);
end;
$$;

REVOKE ALL ON FUNCTION public.sum_order_totals(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sum_order_totals(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sum_order_totals(uuid, timestamptz, timestamptz) TO service_role;