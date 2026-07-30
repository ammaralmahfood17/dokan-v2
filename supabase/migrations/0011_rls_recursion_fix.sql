-- ============================================================================
-- Migration 0011 — Fix RLS infinite recursion (root cause of login failure)
-- ============================================================================
-- Two recursive loops were preventing ANY authenticated user from reaching
-- a dashboard:
--
--   1) public.users  -> policy "users_select_self_or_admin" called
--      is_super_admin() -> which SELECTed from public.users -> re-evaluated
--      the same policy -> "infinite recursion detected in policy for
--      relation users".
--
--   2) public.staff_members -> policy "staff_select_own_business" called
--      staff_business_ids() -> which SELECTed from staff_members -> re-
--      evaluated the same policy -> infinite recursion for NON-super-admins
--      (super admins escaped because is_super_admin() short-circuited first).
--
-- Fix strategy:
--   * Move super-admin membership to a dedicated `super_admins` table that
--     the helper reads instead of public.users.
--   * Rewrite is_super_admin() to read super_admins (no users reference).
--   * Rewrite the staff helper functions to disable row_security locally for
--     their own reads (set local row_security = off) so they never re-trigger
--     the staff_members RLS.
--   * Simplify the staff_members SELECT policy to use user_id = auth.uid()
--     directly (no helper call), keeping is_super_admin() as the admin escape.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Dedicated super_admins table (breaks the users recursion)
-- ---------------------------------------------------------------------------
create table if not exists public.super_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.super_admins enable row level security;

-- Simple, non-recursive read policy: a user can see their own row. It does
-- NOT call is_super_admin(), so there is no loop.
drop policy if exists "super_admins_self_read" on public.super_admins;
create policy "super_admins_self_read" on public.super_admins for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Rewrite is_super_admin() to read the dedicated table
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3) Rewrite users SELECT policy to read super_admins directly
--    (no function call that could re-trigger RLS on users)
-- ---------------------------------------------------------------------------
drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users for select
  using (
    id = auth.uid()
    or exists (select 1 from public.super_admins where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4) Staff helper functions: disable RLS locally for their own reads
--    (breaks the staff_members recursion)
-- ---------------------------------------------------------------------------
create or replace function public.staff_business_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  set local row_security = off;
  return query select business_id from staff_members
    where user_id = auth.uid() and is_active = true;
end;
$$;

create or replace function public.staff_role_for_business(target_business_id uuid)
returns app_role language plpgsql stable security definer set search_path = public as $$
declare r app_role;
begin
  set local row_security = off;
  select role into r from staff_members
    where user_id = auth.uid() and business_id = target_business_id and is_active = true
    order by case role when 'owner' then 1 when 'manager' then 2 when 'staff' then 3 end
    limit 1;
  return r;
end;
$$;

create or replace function public.has_branch_access(target_branch_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  set local row_security = off;
  select exists (
    select 1 from staff_members sm
    join branches b on b.id = target_branch_id
    where sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.business_id = b.business_id
      and (sm.branch_id is null or sm.branch_id = target_branch_id)
  ) into ok;
  return ok;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Simplify the staff_members SELECT policy (no helper recursion)
-- ---------------------------------------------------------------------------
drop policy if exists "staff_select_own_business" on public.staff_members;
create policy "staff_select_own_business" on public.staff_members for select
  using (user_id = auth.uid() or is_super_admin());

-- ---------------------------------------------------------------------------
-- 6) Super-admin assignment is intentionally NOT seeded here.
-- After the first owner registers, promote them with:
--   insert into public.super_admins (user_id) values ('<auth-user-id>');
-- A hard-coded UUID would break every fresh environment and is a
-- security smell in shared migrations.
-- ---------------------------------------------------------------------------
