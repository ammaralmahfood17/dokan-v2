-- ============================================================================
-- Migration 0019 — Allow new user to self-register as owner
-- ============================================================================
-- The existing "staff_owner_manager_write" policy requires the caller to
-- already hold 'owner' or 'manager' role in the business — a chicken-and-egg
-- problem for new registration. This policy opens a narrow path: a user who
-- OWNS the account that owns a business may insert themselves as 'owner'
-- (and only 'owner') of that business. The account owner check uses the
-- accounts → businesses chain instead of the staff_members table, so there
-- is no circular dependency.
-- ============================================================================

drop policy if exists "staff_self_owner_insert" on public.staff_members;

create policy "staff_self_owner_insert" on public.staff_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.businesses b
      join public.accounts a on a.id = b.account_id
      where b.id = business_id
        and a.owner_id = auth.uid()
    )
  );
