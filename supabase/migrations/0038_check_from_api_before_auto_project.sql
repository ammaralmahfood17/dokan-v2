-- 0041: Update safety trigger to skip users from the main API (from_api flag)
-- The function handle_new_user_safety now checks for from_api meta-data flag
-- before creating a project. Users created via /api/auth/signup (which sets
-- from_api='true') will NOT get an auto-created project — they go through
-- the explicit onboarding flow.

-- Drop old function first
drop function if exists public.handle_new_user_safety() cascade;

-- Safety function: create default project + owner if user came from outside the API
create or replace function public.handle_new_user_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_full_name text;
  base_slug text;
  final_slug text;
  new_project_id uuid;
  suffix int := 0;
begin
  -- Only act if this user has no staff_members yet (lightweight check)
  if exists (
    select 1 from public.staff_members where user_id = new.id
  ) then
    return new;
  end if;

  -- Skip if user came through our main API (set from_api=true in user_metadata)
  if new.raw_user_meta_data ? 'from_api' and new.raw_user_meta_data->>'from_api' = 'true' then
    return new;
  end if;

  -- Only create project for users created outside the API (e.g. Supabase dashboard)
  user_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'متجري'
  );

  base_slug := public.generate_basic_slug(user_full_name);

  -- Ensure unique slug (lightweight loop)
  final_slug := base_slug;
  while exists (select 1 from public.projects where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix;
  end loop;

  -- Create a minimal project
  insert into public.projects (name, slug, currency, primary_color, is_active)
  values (
    user_full_name,
    final_slug,
    'BHD',
    '#4338CA',
    true
  )
  returning id into new_project_id;

  -- Create owner membership
  insert into public.staff_members (project_id, user_id, role)
  values (new_project_id, new.id, 'owner');

  return new;
end;
$$;

-- Re-attach the trigger
drop trigger if exists on_auth_user_created_safety on auth.users;

create trigger on_auth_user_created_safety
  after insert on auth.users
  for each row
  execute function public.handle_new_user_safety();
