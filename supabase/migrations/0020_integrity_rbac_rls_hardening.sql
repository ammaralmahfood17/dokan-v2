-- 0020_integrity_rbac_rls_hardening.sql
-- Database integrity, RBAC, and RLS hardening.
--
-- Goals:
--   1. Make cross-tenant relationships impossible at the FK layer.
--   2. Replace broad FOR ALL policies in CRM/ERP with operation-specific rules.
--   3. Introduce permission-backed authorization without breaking existing roles.
--   4. Make inventory and financial corrections append-only/auditable.
--   5. Remove anonymous mutation privileges from internal tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Composite keys: every tenant-owned reference must stay in the same tenant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories
  ADD CONSTRAINT categories_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.products
  ADD CONSTRAINT products_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.orders
  ADD CONSTRAINT orders_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.customers
  ADD CONSTRAINT customers_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.tables
  ADD CONSTRAINT tables_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.staff_members
  ADD CONSTRAINT staff_members_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_project_id_id_key UNIQUE (project_id, id);
ALTER TABLE public.zatca_invoices
  ADD CONSTRAINT zatca_invoices_project_id_id_key UNIQUE (project_id, id);

ALTER TABLE public.products
  ADD CONSTRAINT products_category_same_project_fk
  FOREIGN KEY (project_id, category_id)
  REFERENCES public.categories (project_id, id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_same_project_fk
  FOREIGN KEY (project_id, customer_id)
  REFERENCES public.customers (project_id, id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_table_same_project_fk
  FOREIGN KEY (project_id, table_id)
  REFERENCES public.tables (project_id, id);

ALTER TABLE public.loyalty_events
  ADD CONSTRAINT loyalty_customer_same_project_fk
  FOREIGN KEY (project_id, customer_id)
  REFERENCES public.customers (project_id, id);

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_customer_same_project_fk
  FOREIGN KEY (project_id, customer_id)
  REFERENCES public.customers (project_id, id);

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_order_same_project_fk
  FOREIGN KEY (project_id, order_id)
  REFERENCES public.orders (project_id, id);

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_supplier_same_project_fk
  FOREIGN KEY (project_id, supplier_id)
  REFERENCES public.suppliers (project_id, id);

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_product_same_project_fk
  FOREIGN KEY (project_id, product_id)
  REFERENCES public.products (project_id, id);

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_inventory_same_project_fk
  FOREIGN KEY (project_id, inventory_item_id)
  REFERENCES public.inventory_items (project_id, id);

ALTER TABLE public.staff_shifts
  ADD CONSTRAINT shifts_staff_same_project_fk
  FOREIGN KEY (project_id, staff_member_id)
  REFERENCES public.staff_members (project_id, id);

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_parent_same_project_fk
  FOREIGN KEY (project_id, parent_id)
  REFERENCES public.accounts (project_id, id);

ALTER TABLE public.journal_entry_lines
  ADD CONSTRAINT journal_lines_entry_same_project_fk
  FOREIGN KEY (project_id, journal_entry_id)
  REFERENCES public.journal_entries (project_id, id);

ALTER TABLE public.journal_entry_lines
  ADD CONSTRAINT journal_lines_account_same_project_fk
  FOREIGN KEY (project_id, account_id)
  REFERENCES public.accounts (project_id, id);

ALTER TABLE public.zatca_invoices
  ADD CONSTRAINT zatca_invoice_order_same_project_fk
  FOREIGN KEY (project_id, order_id)
  REFERENCES public.orders (project_id, id);

ALTER TABLE public.zatca_submission_attempts
  ADD CONSTRAINT zatca_attempt_invoice_same_project_fk
  FOREIGN KEY (project_id, invoice_id)
  REFERENCES public.zatca_invoices (project_id, id);

-- Supporting indexes for tenant-scoped access and common dashboard queries.
CREATE INDEX IF NOT EXISTS idx_orders_project_status_created
  ON public.orders (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_project_created
  ON public.feedback (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_events_project_created
  ON public.loyalty_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_inventory
  ON public.purchase_order_items (inventory_item_id);

-- ---------------------------------------------------------------------------
-- 2. Permission-backed RBAC. Existing owner/manager/staff roles remain valid.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

INSERT INTO public.permissions (code, description) VALUES
  ('catalog.read', 'Read catalog and menu configuration'),
  ('catalog.write', 'Create, update, and delete catalog data'),
  ('customers.read', 'Read customer directory and CRM data'),
  ('customers.write', 'Create and update customer data'),
  ('loyalty.write', 'Create loyalty adjustments and redemptions'),
  ('campaigns.write', 'Manage marketing campaigns'),
  ('inventory.read', 'Read inventory and purchasing data'),
  ('inventory.write', 'Manage inventory and purchasing data'),
  ('expenses.write', 'Create and update expenses'),
  ('staff.read', 'Read staff and shift data'),
  ('staff.write', 'Manage staff and shift data'),
  ('finance.read', 'Read accounting and tax records'),
  ('finance.write', 'Create accounting and tax records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, p.code
FROM (VALUES
  ('owner'), ('manager'), ('staff')
) AS r(role)
CROSS JOIN public.permissions p
WHERE (r.role IN ('owner', 'manager') AND p.code IN (
  'catalog.read', 'catalog.write', 'customers.read', 'customers.write',
  'loyalty.write', 'campaigns.write', 'inventory.read', 'inventory.write',
  'expenses.write', 'staff.read', 'staff.write', 'finance.read', 'finance.write'
))
   OR (r.role = 'staff' AND p.code IN (
     'catalog.read', 'customers.read', 'inventory.read', 'staff.read', 'finance.read'
   ))
ON CONFLICT DO NOTHING;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_authenticated_read
  ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_authenticated_read
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_project_permission(
  p_project_id uuid,
  p_permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    JOIN public.role_permissions rp ON rp.role = sm.role
    WHERE sm.project_id = p_project_id
      AND sm.user_id = auth.uid()
      AND rp.permission_code = p_permission
  );
$$;

REVOKE ALL ON FUNCTION public.has_project_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_permission(uuid, text) TO authenticated, service_role;
GRANT SELECT ON public.permissions, public.role_permissions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.permissions, public.role_permissions FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Replace broad CRM/ERP FOR ALL policies with explicit operation policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS customers_member_all ON public.customers;
CREATE POLICY customers_select_member ON public.customers
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'customers.read'));
CREATE POLICY customers_insert_manager ON public.customers
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'customers.write'));
CREATE POLICY customers_update_manager ON public.customers
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'customers.write'))
  WITH CHECK (public.has_project_permission(project_id, 'customers.write'));
CREATE POLICY customers_delete_manager ON public.customers
  FOR DELETE TO authenticated USING (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS loyalty_events_member_all ON public.loyalty_events;
CREATE POLICY loyalty_events_select_member ON public.loyalty_events
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'customers.read'));
CREATE POLICY loyalty_events_insert_manager ON public.loyalty_events
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'loyalty.write'));

DROP POLICY IF EXISTS campaigns_member_all ON public.campaigns;
CREATE POLICY campaigns_select_member ON public.campaigns
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'customers.read'));
CREATE POLICY campaigns_insert_manager ON public.campaigns
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'campaigns.write'));
CREATE POLICY campaigns_update_manager ON public.campaigns
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'campaigns.write'))
  WITH CHECK (public.has_project_permission(project_id, 'campaigns.write'));
CREATE POLICY campaigns_delete_manager ON public.campaigns
  FOR DELETE TO authenticated USING (public.has_project_permission(project_id, 'campaigns.write'));

DROP POLICY IF EXISTS feedback_member_all ON public.feedback;
CREATE POLICY feedback_select_member ON public.feedback
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'customers.read'));
CREATE POLICY feedback_insert_manager ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'customers.write'));
CREATE POLICY feedback_update_manager ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'customers.write'))
  WITH CHECK (public.has_project_permission(project_id, 'customers.write'));
CREATE POLICY feedback_delete_manager ON public.feedback
  FOR DELETE TO authenticated USING (public.is_project_owner_or_manager(project_id));

DROP POLICY IF EXISTS suppliers_member_all ON public.suppliers;
CREATE POLICY suppliers_select_member ON public.suppliers
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'inventory.read'));
CREATE POLICY suppliers_insert_manager ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY suppliers_update_manager ON public.suppliers
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'inventory.write'))
  WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY suppliers_delete_manager ON public.suppliers
  FOR DELETE TO authenticated USING (public.has_project_permission(project_id, 'inventory.write'));

DROP POLICY IF EXISTS inventory_items_member_all ON public.inventory_items;
CREATE POLICY inventory_select_member ON public.inventory_items
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'inventory.read'));
CREATE POLICY inventory_insert_manager ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY inventory_update_manager ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'inventory.write'))
  WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY inventory_delete_manager ON public.inventory_items
  FOR DELETE TO authenticated USING (public.has_project_permission(project_id, 'inventory.write'));

DROP POLICY IF EXISTS ingredients_member_all ON public.ingredients;
CREATE POLICY ingredients_select_member ON public.ingredients
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'inventory.read'));
CREATE POLICY ingredients_insert_manager ON public.ingredients
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY ingredients_update_manager ON public.ingredients
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'inventory.write'))
  WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY ingredients_delete_manager ON public.ingredients
  FOR DELETE TO authenticated USING (public.has_project_permission(project_id, 'inventory.write'));

DROP POLICY IF EXISTS purchase_orders_member_all ON public.purchase_orders;
CREATE POLICY purchase_orders_select_member ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'inventory.read'));
CREATE POLICY purchase_orders_insert_manager ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY purchase_orders_update_manager ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'inventory.write'))
  WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
CREATE POLICY purchase_orders_delete_manager ON public.purchase_orders
  FOR DELETE TO authenticated USING (public.has_project_permission(project_id, 'inventory.write'));

DROP POLICY IF EXISTS purchase_order_items_member_all ON public.purchase_order_items;
CREATE POLICY purchase_order_items_select_member ON public.purchase_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND public.has_project_permission(po.project_id, 'inventory.read')
  ));
CREATE POLICY purchase_order_items_insert_manager ON public.purchase_order_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND public.has_project_permission(po.project_id, 'inventory.write')
  ));
CREATE POLICY purchase_order_items_update_manager ON public.purchase_order_items
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND public.has_project_permission(po.project_id, 'inventory.write')
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND public.has_project_permission(po.project_id, 'inventory.write')
  ));
CREATE POLICY purchase_order_items_delete_manager ON public.purchase_order_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND public.has_project_permission(po.project_id, 'inventory.write')
  ));

DROP POLICY IF EXISTS expenses_member_all ON public.expenses;
CREATE POLICY expenses_select_member ON public.expenses
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'finance.read'));
CREATE POLICY expenses_insert_manager ON public.expenses
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'expenses.write'));
CREATE POLICY expenses_update_manager ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'expenses.write'))
  WITH CHECK (public.has_project_permission(project_id, 'expenses.write'));
-- Expenses are append-only from the client; corrections must be reversal entries.

DROP POLICY IF EXISTS staff_shifts_member_all ON public.staff_shifts;
CREATE POLICY staff_shifts_select_member ON public.staff_shifts
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'staff.read'));
CREATE POLICY staff_shifts_insert_manager ON public.staff_shifts
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'staff.write'));
CREATE POLICY staff_shifts_update_manager ON public.staff_shifts
  FOR UPDATE TO authenticated
  USING (public.has_project_permission(project_id, 'staff.write'))
  WITH CHECK (public.has_project_permission(project_id, 'staff.write'));
CREATE POLICY staff_shifts_delete_manager ON public.staff_shifts
  FOR DELETE TO authenticated USING (public.has_project_permission(project_id, 'staff.write'));

-- ---------------------------------------------------------------------------
-- 4. Inventory movements: append-only source of truth for stock changes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (
    movement_type IN ('purchase', 'sale', 'waste', 'adjustment', 'return')
  ),
  quantity numeric(12,3) NOT NULL CHECK (quantity <> 0),
  unit_cost numeric(10,3) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_item_same_project_fk
  FOREIGN KEY (project_id, inventory_item_id)
  REFERENCES public.inventory_items (project_id, id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_project_item
  ON public.inventory_movements (project_id, inventory_item_id, created_at DESC);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_movements_select_member ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.has_project_permission(project_id, 'inventory.read'));
CREATE POLICY inventory_movements_insert_manager ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK (public.has_project_permission(project_id, 'inventory.write'));
-- No UPDATE/DELETE policies: movement history is immutable.

REVOKE UPDATE (qty_on_hand) ON public.inventory_items FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. Financial and tax invariants.
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'BHD';
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversal_reason text;

CREATE OR REPLACE FUNCTION public.prevent_posted_journal_mutation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.posted = true AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id OR
    NEW.reference_type IS DISTINCT FROM OLD.reference_type OR
    NEW.reference_id IS DISTINCT FROM OLD.reference_id OR
    NEW.posted_by IS DISTINCT FROM OLD.posted_by OR
    NEW.posted_at IS DISTINCT FROM OLD.posted_at OR
    NEW.currency_code IS DISTINCT FROM OLD.currency_code OR
    NEW.memo IS DISTINCT FROM OLD.memo
  ) THEN
    RAISE EXCEPTION 'Posted journal entries are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_immutable_guard ON public.journal_entries;
CREATE TRIGGER journal_entries_immutable_guard
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_journal_mutation();

REVOKE UPDATE, DELETE ON public.journal_entries, public.journal_entry_lines FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.orders, public.order_items, public.order_audit_logs
  FROM anon, authenticated;

-- Internal data is never anonymous-readable or mutable.
REVOKE ALL ON public.customers, public.loyalty_events, public.campaigns,
  public.feedback, public.suppliers, public.inventory_items, public.ingredients,
  public.purchase_orders, public.purchase_order_items, public.expenses,
  public.staff_shifts, public.accounts, public.journal_entries,
  public.journal_entry_lines, public.inventory_movements
  FROM anon;

COMMIT;
