-- ============================================================================
-- 0057: Telegram alert links (per project)
-- ----------------------------------------------------------------------------
-- One platform-wide Telegram bot; each project links one or more chats
-- (owner/staff personal chats or a kitchen group). Order routes send alerts
-- to every linked chat_id.
-- ============================================================================

create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chat_id text not null,
  kind text not null default 'user' check (kind in ('user', 'group')),
  label text,
  created_at timestamptz not null default now(),
  unique (project_id, chat_id)
);

create index if not exists idx_telegram_links_project on public.telegram_links (project_id);

alter table public.telegram_links enable row level security;

create policy "telegram_links_select" on public.telegram_links for select
  using (public.is_project_member(project_id));

create policy "telegram_links_insert" on public.telegram_links for insert
  with check (public.is_project_member(project_id));

create policy "telegram_links_delete" on public.telegram_links for delete
  using (public.is_project_member(project_id));

grant select, insert, delete on public.telegram_links to authenticated;

-- One-time link codes: created in the dashboard, consumed by the bot webhook
-- when the user sends "/start <CODE>" to the bot.
create table if not exists public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_link_codes_code on public.telegram_link_codes (code);

alter table public.telegram_link_codes enable row level security;

create policy "telegram_link_codes_select" on public.telegram_link_codes for select
  using (public.is_project_member(project_id));

create policy "telegram_link_codes_insert" on public.telegram_link_codes for insert
  with check (public.is_project_member(project_id));

grant select, insert on public.telegram_link_codes to authenticated;
