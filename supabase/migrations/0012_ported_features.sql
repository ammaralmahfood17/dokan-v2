-- ============================================================================
-- Migration 0012 — Port advanced SaaS features from dokan-saas (no reviews)
-- Adds: opening_hours, prep_time, ordering_pause on business
--        expanded subscriptions columns
--        payments table (manual tracking)
--        push_subscriptions table
-- All RLS mirrors the original project's super-admin + staff model.
-- ============================================================================

-- ── 1. BUSINESSES: hours / prep / pause / subscription_status ──────────
alter table public.businesses
  add column if not exists opening_hours jsonb not null default '{
    "sun": {"open": "08:00", "close": "23:00", "closed": false},
    "mon": {"open": "08:00", "close": "23:00", "closed": false},
    "tue": {"open": "08:00", "close": "23:00", "closed": false},
    "wed": {"open": "08:00", "close": "23:00", "closed": false},
    "thu": {"open": "08:00", "close": "23:00", "closed": false},
    "fri": {"open": "12:00", "close": "24:00", "closed": false},
    "sat": {"open": "08:00", "close": "24:00", "closed": false}
  }'::jsonb;

alter table public.businesses
  add column if not exists prep_time_minutes int not null default 15;

alter table public.businesses
  add column if not exists ordering_paused boolean not null default false;

alter table public.businesses
  add column if not exists pause_reason_ar text;

alter table public.businesses
  add column if not exists pause_reason_en text;

alter table public.businesses
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('active','trialing','past_due','cancelled','paused','free'));

-- ── 2. SUBSCRIPTIONS: expand for manual billing ──────────────────────
alter table public.subscriptions
  add column if not exists amount_bhd numeric(10,3) not null default 5.000;

alter table public.subscriptions
  add column if not exists currency text not null default 'BHD';

alter table public.subscriptions
  add column if not exists current_period_start timestamptz not null default now();

alter table public.subscriptions
  add column if not exists trial_ends_at timestamptz;

alter table public.subscriptions
  add column if not exists cancelled_at timestamptz;

alter table public.subscriptions
  add column if not exists cancel_reason text;

alter table public.subscriptions
  add column if not exists admin_notes text;

alter table public.subscriptions
  add column if not exists billing_cycle_days int not null default 30;

alter table public.subscriptions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_subs_status on public.subscriptions(status);
create index if not exists idx_subs_period_end on public.subscriptions(current_period_end);

-- ── 3. PAYMENTS (manual record-keeping) ─────────────────────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount_bhd numeric(10,3) not null,
  payment_method text not null default 'cash' check (payment_method in ('cash','bank_transfer','benefit','other')),
  reference text,
  paid_at timestamptz not null default now(),
  period_from timestamptz not null,
  period_to timestamptz not null,
  notes text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_business on public.payments(business_id);
create index if not exists idx_payments_sub on public.payments(subscription_id);

-- ── 4. PUSH SUBSCRIPTIONS ───────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique(business_id, endpoint)
);
create index if not exists idx_push_subs_business on public.push_subscriptions(business_id);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

-- ── 5. ENABLE RLS ─────────────────────────────────────────────────────
alter table public.payments enable row level security;
alter table public.push_subscriptions enable row level security;

-- ── 6. RLS POLICIES ──────────────────────────────────────────────────
-- Payments: owner of the business can read; super admin manages all.
drop policy if exists "owner_read_own_payments" on public.payments;
create policy "owner_read_own_payments" on public.payments for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.account_id in (select staff_business_ids())
    )
    or is_super_admin()
  );

drop policy if exists "superadmin_all_payments" on public.payments;
create policy "superadmin_all_payments" on public.payments for all
  using (is_super_admin());

-- Push: anyone can insert their own sub; the user who owns it can manage it.
drop policy if exists "anyone_insert_push_sub" on public.push_subscriptions;
create policy "anyone_insert_push_sub" on public.push_subscriptions for insert
  with check (true);

drop policy if exists "users_manage_own_push_subs" on public.push_subscriptions;
create policy "users_manage_own_push_subs" on public.push_subscriptions for all
  using (user_id = auth.uid() or is_super_admin());

-- ── 7. TRIGGERS ──────────────────────────────────────────────────────
-- Sync subscription_status onto the business (convenience for UI).
create or replace function public.sync_business_subscription_status()
returns trigger
language plpgsql
as $$
begin
  update public.businesses
    set subscription_status = new.status
    where id = new.business_id;
  return new;
end;
$$;

drop trigger if exists sub_status_sync on public.subscriptions;
create trigger sub_status_sync
  after insert or update on public.subscriptions
  for each row execute function public.sync_business_subscription_status();

-- Auto-update subscriptions.updated_at
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_updated_at();

-- ── 8. REALTIME ──────────────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.push_subscriptions;
  exception when duplicate_object then null;
  end;
end $$;
