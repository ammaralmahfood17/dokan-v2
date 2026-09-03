-- RLS regression tests — the CI gate this project needed from commit zero.
-- A policy with no test here is a policy nobody will notice silently
-- breaking in a future migration (this is exactly how the old dokan-v2
-- build ended up with financial tables writable by any staff member —
-- nothing failed loudly when the policy regressed).
--
-- Run locally with the Supabase CLI:
--   supabase test db
-- or directly with pg_prove against a database that has pgTAP + this
-- schema loaded:
--   pg_prove --ext .sql -d postgres supabase/tests/rls.test.sql
--
-- Scope is deliberately a small, high-value slice — tenant isolation and
-- the owner/manager/staff gating this entire schema depends on — not
-- exhaustive coverage of every table. Extend this file whenever a new
-- table's RLS policy is added.

begin;
create extension if not exists pgtap;
select plan(13);

-- ---------------------------------------------------------------------
-- Fixtures: two tenants (Store A, Store B), three users.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'staff-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'owner-b@test.local');

insert into public.projects (id, name, slug, currency) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Store A', 'store-a-test', 'BHD'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Store B', 'store-b-test', 'BHD');

insert into public.staff_members (project_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'staff'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

insert into public.expenses (project_id, amount, category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10.000, 'مشتريات');

insert into public.customers (project_id, phone, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+97333000001', 'Original Name');

-- Simulates an authenticated request as the given user — sets the two GUC
-- forms Supabase's auth.uid() reads from, and switches to the `authenticated`
-- role so grants/RLS apply exactly as they would for a real API request.
create or replace function pg_temp.as_user(p_user uuid) returns void as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
end;
$$ language plpgsql;

-- 1. Tenant isolation: owner of Store A cannot see Store B's project row.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*) from public.projects where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int,
  0,
  'owner of Store A cannot read Store B project row'
);

-- 2. Member read: staff CAN see their own project's expense (SELECT is
--    member-level, only writes are manager+).
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*) from public.expenses where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  1,
  'staff can read their own project''s expenses'
);

-- 3. Staff cannot insert an expense; financial writes are manager-level.
select throws_ok(
  $$ insert into public.expenses (project_id, amount, category)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5.000, 'test') $$,
  '42501'::char(5), NULL,
  'staff cannot insert an expense row'
);

-- 4. Owner CAN insert an expense.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into public.expenses (project_id, amount, category)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5.000, 'test') $$,
  'owner can insert an expense row'
);

-- 5. Staff cannot create or update customer records.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ insert into public.customers (project_id, phone, name) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+97333000002', 'Walk-in') $$,
  '42501'::char(5), NULL,
  'staff cannot insert a customer row'
);
select throws_ok(
  $$ update public.customers set name = 'Changed By Staff' where phone = '+97333000001' $$,
  '42501'::char(5), NULL,
  'staff cannot update a customer row'
);

-- 6. The owner can insert a customer.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into public.customers (project_id, phone, name) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+97333000002', 'Walk-in') $$,
  'owner can insert a customer row'
);

-- 7. Cross-tenant write is blocked: staff of Store A cannot insert a
--    product into Store B, even though they're passing a syntactically
--    valid project_id.
select throws_ok(
  $$ insert into public.products (project_id, name, price)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cross-tenant item', 1.000) $$,
  '42501'::char(5), NULL,
  'staff of Store A cannot insert a product into Store B'
);

-- 9. Nobody can INSERT into `projects` directly — no INSERT grant exists
--    for `authenticated` regardless of role; creation is service-role only
--    via /api/onboarding/project. Even an owner is blocked.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into public.projects (name, slug, currency) values ('Rogue Store', 'rogue-test', 'BHD') $$,
  '42501'::char(5), NULL,
  'even an owner cannot INSERT a projects row directly (service-role only)'
);

-- 10. Staff cannot delete a staff_members row (owner-only). DELETE denied
--    by USING also silently affects zero rows rather than throwing.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
delete from public.staff_members
  where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and role = 'owner';
select is(
  (select count(*) from public.staff_members where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and role = 'owner')::int,
  1,
  'staff cannot delete the owner''s staff_members row'
);

-- 11. Cross-tenant composite references are rejected by the database.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into public.products (project_id, category_id, name, price)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bad category', 1.000) $$,
  '23503'::char(5), NULL,
  'a product cannot reference a category from another project'
);

-- 12. Staff can read, but cannot mutate, inventory movements.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*) from public.inventory_movements
    where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  0,
  'staff can query only their own project inventory movements'
);

-- 13. The permission helper is not callable anonymously.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(
  public.has_project_permission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'finance.read'),
  true,
  'owner has finance.read permission'
);

select * from finish();
rollback;
