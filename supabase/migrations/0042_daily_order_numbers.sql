-- 0042: Add daily sequential order numbers per project
-- Each project gets order numbers 1, 2, 3... daily (resets each day).
-- Uses atomic upsert for concurrency safety.

-- Counter table (per-project, per-day)
create table if not exists public.daily_order_counters (
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null default current_date,
  counter integer not null default 0,
  primary key (project_id, date)
);

-- Secure function to atomically get + increment the counter
create or replace function public.next_order_number(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.daily_order_counters (project_id, date, counter)
  values (p_project_id, current_date, 1)
  on conflict (project_id, date)
  do update set counter = daily_order_counters.counter + 1
  returning counter into v_next;

  return v_next;
end;
$$;

-- Add order_number column (NOT NULL after backfill)
alter table public.orders add column if not exists order_number integer;
update public.orders set order_number = 0 where order_number is null;
alter table public.orders alter column order_number set not null;
alter table public.orders alter column order_number set default 0;

-- Index for looking up by project + number
create index if not exists idx_orders_project_number
  on public.orders (project_id, order_number);

-- Backfill existing orders with sequential numbers per project
-- (orders within the same project get numbered by created_at)
do $$
declare
  r record;
  v_num integer := 0;
  v_last_project uuid := '00000000-0000-0000-0000-000000000000';
begin
  for r in
    select id, project_id, created_at
    from public.orders
    where order_number is null
    order by project_id, created_at
  loop
    if r.project_id != v_last_project then
      v_num := 0;
      v_last_project := r.project_id;
    end if;
    v_num := v_num + 1;
    update public.orders set order_number = v_num where id = r.id;
  end loop;
end;
$$;
