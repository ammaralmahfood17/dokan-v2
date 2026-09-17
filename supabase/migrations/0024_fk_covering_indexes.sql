-- Covering indexes for the 36 foreign keys flagged by the performance
-- advisor as unindexed. Matched by hand against existing indexes
-- (leftmost-column coverage) before being added — no duplicates.
-- Already applied directly to production; this brings the migrations
-- directory back in sync.

CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_project_customer ON public.orders (project_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON public.orders (table_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS idx_projects_plan_code ON public.projects (plan_code);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_table ON public.service_requests (table_id);
CREATE INDEX IF NOT EXISTS idx_tables_project_branch ON public.tables (project_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_created_by ON public.telegram_link_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_project ON public.telegram_link_codes (project_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON public.telegram_links (user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_events_project_customer ON public.loyalty_events (project_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_order ON public.feedback (order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_customer ON public.feedback (customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_project_order ON public.feedback (project_id, order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_project_customer ON public.feedback (project_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier ON public.inventory_items (supplier_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_inventory_item ON public.ingredients (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_project ON public.ingredients (project_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_project_inventory ON public.ingredients (project_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_project_product ON public.ingredients (project_id, product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project_supplier ON public.purchase_orders (project_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_project_staff ON public.staff_shifts (project_id, staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_member ON public.staff_shifts (staff_member_id);
CREATE INDEX IF NOT EXISTS idx_accounts_project_parent ON public.accounts (project_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_jernel_project_account ON public.journal_entry_lines (project_id, account_id);
CREATE INDEX IF NOT EXISTS idx_jernel_project_entry ON public.journal_entry_lines (project_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_project_order ON public.zatca_invoices (project_id, order_id);
CREATE INDEX IF NOT EXISTS idx_zatca_attempts_project ON public.zatca_submission_attempts (project_id);
CREATE INDEX IF NOT EXISTS idx_zatca_attempts_project_invoice ON public.zatca_submission_attempts (project_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_code ON public.role_permissions (permission_code);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_by ON public.inventory_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_staff_branch_access_project_staff ON public.staff_branch_access (project_id, staff_member_id);
CREATE INDEX IF NOT EXISTS idx_event_outbox_project ON public.event_outbox (project_id);
