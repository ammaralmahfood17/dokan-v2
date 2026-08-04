-- ============================================================================
-- 0018_enable_realtime_for_orders.sql
--
-- WHY: the kitchen + orders screens subscribe to postgres_changes on
-- `orders` / `order_items`, but neither table was in the realtime
-- publication. Channels reached SUBSCRIBED while ZERO events arrived, so
-- both screens silently fell back to their 30s poll — an order took up to
-- 30 seconds to appear on the kitchen screen. Verified live with a probe
-- project: INSERT event never arrived within 10s.
--
-- FIX: add both tables to the realtime publication (idempotent via DO
-- blocks — orders may already be a member on some projects). REPLICA
-- IDENTITY FULL is required so UPDATE/DELETE payloads carry the full old
-- row (the kitchen reads payload.old.id on DELETE).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

alter table public.orders replica identity full;
alter table public.order_items replica identity full;
