-- 0044: Remove branches feature
-- Drops the branches table and removes branch_id from tables

-- First make branch_id nullable so we can drop branches
alter table public.tables alter column branch_id drop not null;
alter table public.tables drop constraint if exists tables_branch_id_fkey;

-- Set existing branch_id to null
update public.tables set branch_id = null where branch_id is not null;

-- Drop RLS policies on branches
drop policy if exists branches_select on public.branches;
drop policy if exists branches_write on public.branches;

-- Drop branches table
drop table if exists public.branches cascade;

-- Drop related functions (legacy)
drop function if exists public.next_branch_order_number;
