-- ============================================================================
-- 0045: RLS for order_audit_logs
-- ============================================================================
-- Adds missing RLS policies for the order_audit_logs table.

alter table public.order_audit_logs enable row level security;

create policy "order_audit_logs_select" on public.order_audit_logs for select
  using (public.is_project_member(project_id));

create policy "order_audit_logs_insert" on public.order_audit_logs for insert
  with check (public.is_project_member(project_id));

grant select, insert on public.order_audit_logs to authenticated;
