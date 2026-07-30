-- ============================================================================
-- Migration 0013 — Port: profiles table + handle_new_user trigger
-- (product_modifiers already covers variations/addons as grouped modifiers)
-- ============================================================================

-- ── 1. PROFILES TABLE ───────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users_manage_own_profile"
  on public.profiles for all
  using (auth.uid() = id);

create policy "superadmin_read_profiles"
  on public.profiles for select
  using (is_super_admin());

-- ── 2. handle_new_user TRIGGER ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();
