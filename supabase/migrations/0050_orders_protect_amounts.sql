-- 0050_orders_protect_amounts.sql
-- Protect total_amount and order_number from being modified after insert.
-- Replaces the overly-permissive "orders_staff_all" (FOR ALL) policy
-- with scoped policies + a DB-level trigger as defense-in-depth.

-- 1. Drop the catch-all policy
drop policy if exists "orders_staff_all" on public.orders;

-- 2. Scoped policies
create policy "orders_staff_select"
  on public.orders for select
  using (public.is_project_member(project_id));

create policy "orders_staff_insert"
  on public.orders for insert
  with check (public.is_project_member(project_id));

create policy "orders_staff_update_status"
  on public.orders for update
  using (public.is_project_member(project_id))
  with check (
    public.is_project_member(project_id)
    and old.total_amount = new.total_amount
    and old.order_number = new.order_number
  );

-- 3. Trigger as belt-and-suspenders protection
create or replace function public.orders_protect_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.total_amount is distinct from new.total_amount then
    raise exception 'total_amount cannot be modified after insert (%)', new.id using errcode = 'RLS001';
  end if;
  if old.order_number is distinct from new.order_number then
    raise exception 'order_number cannot be modified after insert (%)', new.id using errcode = 'RLS001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_protect_amounts_trigger on public.orders;
create trigger orders_protect_amounts_trigger
before update on public.orders
for each row
execute function public.orders_protect_amounts();
