-- ============================================================================
-- 0052: Restrict push subscriptions to staff of the project
-- ============================================================================
-- The 0048 insert policy only verified `auth.uid() = user_id`, so ANY
-- authenticated user could subscribe to ANY project's notifications
-- (they just had to know/guess the project UUID). Require membership in
-- staff_members for the target project.
-- Also defensively drop the legacy 0012 policies in case they exist.

drop policy if exists "anyone_insert_push_sub" on public.push_subscriptions;
drop policy if exists "users_manage_own_push_subs" on public.push_subscriptions;

drop policy if exists "push_subscriptions_insert" on public.push_subscriptions;
create policy "push_subscriptions_insert"
  on public.push_subscriptions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.staff_members sm
      where sm.user_id = auth.uid()
        and sm.project_id = push_subscriptions.project_id
    )
  );
