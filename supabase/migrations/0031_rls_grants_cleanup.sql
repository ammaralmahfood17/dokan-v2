-- ============================================================================
-- Phase 1: Initial RLS Grants Cleanup + Service Role Hardening
-- ============================================================================
-- This migration tightens overly broad grants from earlier migrations.
-- We move toward least-privilege while keeping the app functional.
--
-- NOTE: Full least-privilege will be refined in later phases.
-- Service role (used by validated public APIs) still needs write access.
-- ============================================================================

-- Revoke broad blanket grants where possible
revoke all on all tables in schema public from authenticated;
revoke all on all tables in schema public from anon;

-- Re-grant only what is truly needed for authenticated (staff) users
-- Staff can read/write within their project via RLS policies
grant usage on schema public to authenticated;

-- Read access to catalog (needed for dashboard + public menus)
grant select on public.projects,
               public.branches,
               public.tables,
               public.categories,
               public.products,
               public.product_addons
to authenticated;

-- Full CRUD on core operational tables (RLS will restrict per project)
grant select, insert, update, delete on public.projects,
                                       public.branches,
                                       public.tables,
                                       public.categories,
                                       public.products,
                                       public.product_addons,
                                       public.orders,
                                       public.order_items,
                                       public.staff_members
to authenticated;

-- Anon (public customers) - very limited
grant usage on schema public to anon;
grant select on public.projects,
               public.branches,
               public.tables,
               public.categories,
               public.products,
               public.product_addons
to anon;

-- Service role keeps full access (used only after server validation in APIs)
-- No change needed for service_role role itself.

-- Add comment for future reference
comment on schema public is 'Dokan SaaS - RLS hardened. Service role only used after validation in /api/public/* and onboarding.';

-- Ensure the key RLS functions remain executable
grant execute on function public.is_project_member(uuid) to authenticated, anon;
grant execute on function public.is_project_owner(uuid) to authenticated, anon;
grant execute on function public.project_has_no_members(uuid) to authenticated;
-- Additional Phase 1 note on realtime (to prevent leaks)
-- Realtime for orders/order_items is enabled.
-- Access is still controlled by RLS policies (is_project_member).
-- Do not publish sensitive fields without RLS coverage.
-- If leaks are detected later, consider row-level filters or private channels.
