-- ============================================================================
-- DOKAN — Fix: allow a business owner to create their own initial trial
-- subscription at signup (previously only super_admin could insert here,
-- which would have made the auto-trial-enrollment in register() fail RLS).
-- ============================================================================
drop policy if exists "subscriptions_super_admin_write" on public.subscriptions;

create policy "subscriptions_insert" on public.subscriptions for insert
  with check (
    staff_role_for_business(business_id) = 'owner'
    or is_super_admin()
  );

-- Keep updates (changing plan/status after the fact) super_admin-only.
