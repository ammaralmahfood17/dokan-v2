-- 0059: RLS hardening — order counters + categories
-- Found by deep audit (08-01): anon could read/write ANY project's order
-- counter (breaking order numbers for competitors); categories were
-- world-readable via `using (true)` with no active-store scoping.

-- 🔴 daily_order_counters: lock down completely (order numbers = money-adjacent)
alter table public.daily_order_counters enable row level security;
-- No policies = deny all. The security-definer rpc next_order_number()
-- bypasses RLS by design and keeps working.
revoke all on public.daily_order_counters from anon, authenticated;
grant execute on function public.next_order_number(uuid) to anon, authenticated;

-- 🟡 categories: add is_active (like products.is_available) + restrict the
-- public read to active stores only.
alter table public.categories add column if not exists is_active boolean not null default true;

drop policy if exists categories_select on public.categories;
create policy "categories_select"
  on public.categories for select
  using (public.is_project_member(project_id) or is_active = true);
