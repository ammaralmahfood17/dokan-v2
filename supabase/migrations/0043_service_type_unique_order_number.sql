-- ============================================================================
-- 0046: Service type for orders + order_number unique constraint
-- ============================================================================
-- Adds service_type column to differentiate waiter/bill requests from real orders.
-- Adds unique constraint on order_number per project as a safety net.
-- ============================================================================

-- 1. Add service_type column (null = real order, 'waiter' = waiter call, 'bill' = bill request)
alter table public.orders add column if not exists service_type text;

do $$ begin
  alter table public.orders add constraint orders_service_type_check 
    check (service_type is null or service_type in ('waiter', 'bill'));
exception when duplicate_object then null;
end $$;

-- 2. Backfill existing service requests (identified by total_amount = 0 + notes pattern)
update public.orders set service_type = 'waiter'
  where service_type is null and total_amount = 0 and notes ilike '%طلب موظف%';

update public.orders set service_type = 'bill'
  where service_type is null and total_amount = 0 and notes ilike '%طلب فاتورة%';

-- 3. Unique constraint on order_number per project (only for real orders, excludes service requests)
create unique index if not exists idx_orders_project_number_unique 
  on public.orders (project_id, order_number) 
  where service_type is null;

-- 4. Index on service_type for fast filtering
create index if not exists idx_orders_service_type 
  on public.orders (service_type) 
  where service_type is not null;

-- 5. RLS: allow staff to read/write orders with service_type
-- (existing RLS policies already cover this since service_type is just a column)

comment on column public.orders.service_type is 'Null = real order, ''waiter'' = call waiter, ''bill'' = request bill';
comment on index idx_orders_project_number_unique is 'Safety net: prevents duplicate order numbers per project';