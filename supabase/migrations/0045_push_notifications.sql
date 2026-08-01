-- ============================================================================
-- 0048: Push notifications — subscription storage + RLS
-- ============================================================================

-- 1. Create push_subscriptions table (fresh MVP schema)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (endpoint)
);

-- Speed up lookups by project (sending notifications)
create index if not exists idx_push_sub_project
  on public.push_subscriptions(project_id);

-- 2. Enable RLS + policies
alter table public.push_subscriptions enable row level security;

-- Any authenticated user can read their own subscriptions
create policy "push_subscriptions_select"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

-- Any authenticated user can insert their own subscription
create policy "push_subscriptions_insert"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

-- Users can delete their own subscriptions
create policy "push_subscriptions_delete"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
