-- ============================================================================
-- Phase 3: Performance Indexes
-- ============================================================================
-- Targeted indexes for hot paths:
-- - Orders by project + status + created_at (for dashboard, kitchen, orders list)
-- - Products by project + category + is_available
-- - Order items by order
-- - Staff by project + user
-- These complement the ones already in 0032 and 0034.
-- ============================================================================

-- Orders: frequent filters in dashboard/kitchen/orders
create index if not exists idx_orders_project_status_created 
  on public.orders (project_id, status, created_at desc);

create index if not exists idx_orders_project_created 
  on public.orders (project_id, created_at desc);

-- Products: menu + product management queries
create index if not exists idx_products_project_category_available 
  on public.products (project_id, category_id, is_available);

create index if not exists idx_products_project_available 
  on public.products (project_id, is_available);

-- Order items already has idx_order_items_order from 0032

-- Staff (used in RLS and onboarding)
create index if not exists idx_staff_members_project_user 
  on public.staff_members (project_id, user_id);

-- Categories for menu ordering
create index if not exists idx_categories_project_sort 
  on public.categories (project_id, sort_order);

-- Product addons (used in order validation)
create index if not exists idx_product_addons_product_available 
  on public.product_addons (product_id, is_available);

comment on index idx_orders_project_status_created is 'Phase 3: Hot path for orders list + kitchen + recent orders';
comment on index idx_products_project_category_available is 'Phase 3: Menu rendering + product filtering';
