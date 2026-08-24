-- RPC regression tests (adapted to dokan-v2 schema: create_order_transactional
-- signature with p_type/p_status/p_order_number/p_caller_user_id).
-- Run: supabase test db

begin;
create extension if not exists pgtap;
select plan(10);

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'owner-fn2@test.local');
insert into public.projects (id, name, slug, currency) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Store FN2', 'store-fn2-test', 'BHD');
insert into public.staff_members (project_id, user_id, role) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.products (id, project_id, name, price, is_available) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'قهوة', 1.500, true);

create or replace function pg_temp.as_user(p_user uuid) returns void as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
end;
$$ language plpgsql;

select set_config('role', 'service_role', true);

-- 1. create_order_transactional inserts order with exact given total.
select public.create_order_transactional(
  p_project_id => 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
  p_type => 'walkin',
  p_status => 'pending',
  p_total_amount => 3.000,
  p_order_number => 1,
  p_items => '[{"product_id":"ffffffff-ffff-ffff-ffff-ffffffffffff","product_name":"قهوة","quantity":2,"unit_price":1.500,"addons":[],"notes":null}]'::jsonb,
  p_table_id => null,
  p_notes => 'no onions',
  p_caller_user_id => '55555555-5555-5555-5555-555555555555'::uuid,
  p_idempotency_key => 'fn-test-key-001'
);
select is(
  (select total_amount from public.orders where idempotency_key = 'fn-test-key-001')::numeric,
  3.000::numeric,
  'created order has the exact total it was given'
);

-- 2. ...and the matching order_items row.
select is(
  (select count(*)::int from public.order_items oi join public.orders o on o.id = oi.order_id
     where o.idempotency_key = 'fn-test-key-001'),
  1,
  'order_items row was created alongside the order'
);

-- 3. A second order gets the next sequential number.
select public.create_order_transactional(
  p_project_id => 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
  p_type => 'walkin',
  p_status => 'pending',
  p_total_amount => 1.500,
  p_order_number => 2,
  p_items => '[{"product_id":"ffffffff-ffff-ffff-ffff-ffffffffffff","product_name":"قهوة","quantity":1,"unit_price":1.500,"addons":[],"notes":null}]'::jsonb,
  p_table_id => null,
  p_notes => null,
  p_caller_user_id => '55555555-5555-5555-5555-555555555555'::uuid,
  p_idempotency_key => 'fn-test-key-002'
);
select is(
  (select array_agg(order_number order by order_number) from public.orders
     where project_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')::int[],
  array[1, 2],
  'order numbers are sequential per project'
);

-- 4. Duplicate idempotency key is rejected at the database level.
select throws_ok(
  $$ select public.create_order_transactional(
       p_project_id => 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
       p_type => 'walkin',
       p_status => 'pending',
       p_total_amount => 9.999,
       p_order_number => 3,
       p_items => '[]'::jsonb,
       p_table_id => null,
       p_notes => null,
       p_caller_user_id => '55555555-5555-5555-5555-555555555555'::uuid,
       p_idempotency_key => 'fn-test-key-001'
     ) $$,
  '23505'::char(5), NULL,
  'duplicate idempotency key is rejected, not double-inserted'
);

-- 5. advance_order_status valid transition as authenticated owner.
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');

select lives_ok(
  $$ select public.advance_order_status(
       (select id from public.orders where idempotency_key = 'fn-test-key-001'),
       'pending', 'preparing'
     ) $$,
  'valid status transition (pending -> preparing) succeeds'
);

-- 6. Stale expected-status is rejected.
-- Order is already 'preparing'; re-advancing from 'pending' hits the
-- atomic stale check.
select throws_ok(
  $$ select public.advance_order_status(
       (select id from public.orders where idempotency_key = 'fn-test-key-001'),
       'pending', 'preparing'
     ) $$,
  'P0001'::char(5), 'STALE_STATUS: order state changed on another device',
  'stale transition is rejected with STALE_STATUS'
);

-- 6b. A valid pair but wrong current state still hits STALE_STATUS.
select throws_ok(
  $$ select public.advance_order_status(
       (select id from public.orders where idempotency_key = 'fn-test-key-001'),
       'ready', 'delivered'
     ) $$,
  'P0001'::char(5), 'STALE_STATUS: order state changed on another device',
  'ready->delivered on preparing order also lands as STALE_STATUS'
);

-- 7. Skipping a state is rejected.
select throws_ok(
  $$ select public.advance_order_status(
       (select id from public.orders where idempotency_key = 'fn-test-key-002'),
       'pending', 'completed'
     ) $$,
  'INVALID_TRANSITION: pending -> completed',
  'skipping states (pending -> completed) is rejected'
);

-- 8. Terminal state: full KDS chain lands the order on 'delivered' and its
--    line items on 'ready' atomically (v2 has no get_dashboard_summary —
--    aggregation lives in the app layer).
select public.advance_order_status(
  (select id from public.orders where idempotency_key = 'fn-test-key-001'), 'preparing', 'ready'
);
select public.advance_order_status(
  (select id from public.orders where idempotency_key = 'fn-test-key-001'), 'ready', 'delivered'
);
select is(
  (select status from public.orders where idempotency_key = 'fn-test-key-001')::text,
  'delivered',
  'full KDS chain ends at delivered'
);
select is(
  (select array_agg(distinct oi.status) from public.order_items oi join public.orders o on o.id = oi.order_id
     where o.idempotency_key = 'fn-test-key-001'),
  array['ready'],
  'line items advanced to ready in the same transaction (delivered order)'
);

select * from finish();
rollback;
