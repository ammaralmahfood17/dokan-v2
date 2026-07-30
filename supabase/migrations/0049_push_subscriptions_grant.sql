-- 0049_push_subscriptions_grant.sql
-- Grant authenticated role access to push_subscriptions so that
-- createClient() (RLS-respecting) works for both subscribe and unsubscribe.
-- This fixes the bug where unsubscribe() was failing with a permission error
-- because authenticated had no DELETE grant on this table.

grant select, insert, delete on public.push_subscriptions to authenticated;
grant select on public.push_subscriptions to anon;
