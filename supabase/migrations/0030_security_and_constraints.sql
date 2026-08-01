-- ============================================================================
-- Security hardening + data integrity
-- ============================================================================

-- 1. Prevent any authenticated user from joining any project as staff
drop policy if exists "staff_insert_self" on public.staff_members;

-- Only allow first owner claim (empty project membership)
create or replace function public.project_has_no_members(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.staff_members sm where sm.project_id = p_project_id
  );
$$;

grant execute on function public.project_has_no_members(uuid) to authenticated;

create policy "staff_insert_first_owner"
  on public.staff_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.project_has_no_members(project_id)
  );

-- Owners may invite other staff later (manager/staff)
create policy "staff_insert_by_owner"
  on public.staff_members for insert
  to authenticated
  with check (
    public.is_project_owner(project_id)
    and role in ('manager', 'staff')
  );

-- 2. Unique table number per project
create unique index if not exists tables_project_number_unique
  on public.tables (project_id, number);

-- 3. Ensure quantity is integer-like (DB already has quantity > 0)
-- No change needed if check exists; add floor guard via trigger optional.

comment on policy "staff_insert_first_owner" on public.staff_members is
  'Only first owner of an empty project may self-insert';
