-- 0040: Lightweight safety trigger for users signing up outside the main API
-- Purpose: If a user is created directly in Supabase Auth (or any other path),
-- ensure they get a minimal default project + owner membership so they can proceed.
-- This is "light" (خفيف): it only creates if the user has zero staff_members.
-- It does NOT replace the explicit onboarding flow.

-- Basic slug generator in SQL (handles Arabic/English roughly)
create or replace function public.generate_basic_slug(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(coalesce(input, ''));
  -- very rough Arabic to latin (extend as needed)
  s := translate(s,
    'أإآاابتثجحخدذرزسشصضطظعغفقكلمنهويةىئؤء٠١٢٣٤٥٦٧٨٩',
    'aaaabtthjkhddrzsssdttaghfqklmnhwyayyuw000000000');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');
  if s = '' or s is null then
    s := 'store-' || substr(md5(random()::text), 1, 6);
  end if;
  return left(s, 48);
end;
$$;

-- Safety function: create default project + owner if none exists
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

  -- Get name from metadata or fallback
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

-- Attach the trigger (after insert on auth.users)
drop trigger if exists on_auth_user_created_safety on auth.users;

create trigger on_auth_user_created_safety
  after insert on auth.users
  for each row
  execute function public.handle_new_user_safety();