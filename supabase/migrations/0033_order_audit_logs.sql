-- ============================================================================
-- Phase 3: Simple Order Audit Log (lightweight)
-- ============================================================================
-- Records key events for orders (created, status changes).
-- This is a simple table for now. In future can be replaced by Supabase logs + webhooks.
-- ============================================================================

create table if not exists public.order_audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event text not null check (event in ('created', 'status_changed', 'cancelled')),
  old_status text,
  new_status text,
  actor_user_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_order_audit_order on public.order_audit_logs (order_id);
create index if not exists idx_order_audit_project_created on public.order_audit_logs (project_id, created_at desc);

comment on table public.order_audit_logs is 'Phase 3: Lightweight audit trail for orders';

-- Note: Inserts will be done from server-side APIs using service role after validation.
