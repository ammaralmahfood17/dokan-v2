-- ============================================================================
-- Migration 0015 — Tighten subscriptions insert policy
-- ============================================================================
-- 0008 widened subscriptions insert to "owner of ANY business OR super_admin"
-- using the client-supplied business_id. That let an owner of business A
-- insert a subscription row for business B (UUID guess). Scope it so an owner
-- can only insert a subscription for a business they actually own.
-- ============================================================================

drop policy if exists "subscriptions_insert" on public.subscriptions;
drop policy if exists "subscriptions_owner_insert" on public.subscriptions;

create policy "subscriptions_owner_insert" on public.subscriptions for insert
  with check (
    business_id in (select staff_business_ids())
    and exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.account_id in (select id from public.accounts where owner_id = auth.uid())
    )
    or is_super_admin()
  );
