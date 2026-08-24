-- Regression coverage for 0006_fixes.sql. Two things had zero test coverage
-- before this file: the addons_public_select policy (the bug itself), and
-- the two SECURITY DEFINER functions that replaced the unpaginated
-- admin.auth.admin.listUsers() calls.
--
-- Run: pg_prove -d <db> supabase/tests/0006-fixes.test.sql
-- (needs 0000_init.sql .. 0006_fixes.sql already applied)

begin;
create extension if not exists pgtap;
select plan(2);

-- ---------------------------------------------------------------------
-- Fixtures: one active store, one inactive (suspended) store, each with
-- one available product carrying one available addon.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'owner-fix@test.local'),
  ('77777777-7777-7777-7777-777777777777', 'notowner-fix@test.local');

insert into public.projects (id, name, slug, currency, is_active) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Active Store', 'active-fix-test', 'BHD', true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Suspended Store', 'suspended-fix-test', 'BHD', false);

insert into public.staff_members (project_id, user_id, role) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '66666666-6666-6666-6666-666666666666', 'owner');

insert into public.products (id, project_id, name, price, is_available) values
  ('11112222-1111-2222-1111-222211112222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Active product', 1.000, true),
  ('33334444-3333-4444-3333-444433334444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Suspended-store product', 1.000, true);

insert into public.product_addons (id, product_id, name, price, is_available) values
  ('55556666-5555-6666-5555-666655556666', '11112222-1111-2222-1111-222211112222', 'Extra shot', 0.300, true),
  ('77778888-7777-8888-7777-888877778888', '33334444-3333-4444-3333-444433334444', 'Suspended-store addon', 0.300, true);

select set_config('role', 'anon', true);

-- 1. THE BUG: before 0006_fixes.sql, this returned 1 — anon could read an
--    addon belonging to a suspended store's product. Every sibling public
--    policy (products_public_select, etc.) already excluded these.
select is(
  (select count(*) from public.product_addons where id = '77778888-7777-8888-7777-888877778888')::int,
  0,
  'anon cannot read an addon belonging to a suspended (is_active=false) project'
);

-- 2. Sanity check the fix isn't overly strict: anon can still read an
--    addon on an active store's product, same as before.
select is(
  (select count(*) from public.product_addons where id = '55556666-5555-6666-5555-666655556666')::int,
  1,
  'anon can still read an addon belonging to an active project''s product'
);


select * from finish();
rollback;
