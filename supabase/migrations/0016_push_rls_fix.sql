-- ============================================================================
-- Migration 0016 — Apply runtime security fixes that the code now relies on
-- ============================================================================
-- These policies back the application fixes in the corresponding code review:
--   * push_subscriptions insert is now scoped to the caller's own business
--     (prevents a user registering a push sub under another tenant's
--     business_id and receiving their order notifications).
--   * (0014/0015 are separate files; this one only covers the push fix that
--     editied an already-applied migration.)
-- ============================================================================

-- Replace the permissive "anyone_insert" policy with an ownership-scoped one.
drop policy if exists "anyone_insert_push_sub" on public.push_subscriptions;
create policy "owner_insert_push_sub" on public.push_subscriptions for insert
  with check (
    auth.uid() = user_id
    and business_id in (select staff_business_ids())
  );

-- Keep the self/manage policy intact.
drop policy if exists "users_manage_own_push_subs" on public.push_subscriptions;
create policy "users_manage_own_push_subs" on public.push_subscriptions for all
  using (user_id = auth.uid() or is_super_admin());
