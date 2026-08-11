-- ============================================================================
-- 0006_crm_erp_billing.sql
-- Phase: CRM + ERP/Back-Office + Billing tiers (Dokan v2)
-- Tenant-scoped additions mirroring existing conventions:
--   * every row carries project_id → is_project_member(project_id) RLS gate
--   * grant-all to authenticated/service_role, then policies restrict
--   * numeric(10,3) money (BHD three decimals), numeric for quantities
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Billing tiers — plan catalog + tenant plan_code
-- ---------------------------------------------------------------------------
CREATE TABLE public.subscription_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text,
  price numeric(10,3) NOT NULL DEFAULT 0,
  billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'yearly')),
  max_staff integer,
  max_branches integer,
  max_tables integer,
  max_products integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_plans IS 'Public catalog of SaaS plans (free/growth/enterprise). Readable by anon; writes are service-role only.';

INSERT INTO public.subscription_plans (code, name, name_en, price, billing_interval, max_staff, max_branches, max_tables, max_products, features) VALUES
  ('free', 'مجاني', 'Free', 0, 'monthly', 1, 1, 10, 50,
   '["single branch", "QR menu", "POS", "analytics"]'::jsonb),
  ('growth', 'نمو', 'Growth', 29.000, 'monthly', 5, 2, 30, 300,
   '["up to 2 branches", "QR menu", "POS", "KDS", "CRM", "inventory", "analytics", "telegram alerts"]'::jsonb),
  ('enterprise', 'مؤسسة', 'Enterprise', 99.000, 'monthly', 50, 10, 200, 2000,
   '["unlimited branches", "QR menu", "POS", "KDS", "CRM", "ERP", "multi-language", "BenefitPay", "dedicated support"]'::jsonb);

ALTER TABLE public.projects
  ADD COLUMN plan_code text NOT NULL DEFAULT 'free'
    REFERENCES public.subscription_plans(code);

-- Bahrain VAT: 10% stored as percent. Frontend formats receipts/reports.
ALTER TABLE public.projects
  ADD COLUMN vat_rate numeric(5,2) NOT NULL DEFAULT 10;

-- ---------------------------------------------------------------------------
-- 2. CRM — customers, loyalty, campaigns, feedback
-- ---------------------------------------------------------------------------
CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  name_en text,
  email text,
  loyalty_points integer NOT NULL DEFAULT 0,
  total_spent numeric(10,3) NOT NULL DEFAULT 0,
  visit_count integer NOT NULL DEFAULT 0,
  last_visit_at timestamptz,
  is_opted_in boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, phone)
);

CREATE INDEX idx_customers_project ON public.customers USING btree (project_id);
CREATE INDEX idx_customers_project_loyalty ON public.customers USING btree (project_id, loyalty_points DESC);

-- Link orders → customers (nullable; existing orders stay unattributed)
ALTER TABLE public.orders
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);

CREATE TABLE public.loyalty_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('earn', 'redeem', 'adjust')),
  points integer NOT NULL CHECK (points <> 0),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_events_customer ON public.loyalty_events USING btree (customer_id, created_at DESC);

CREATE TABLE public.campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email', 'push')),
  message_ar text NOT NULL,
  message_en text,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_project ON public.campaigns USING btree (project_id, created_at DESC);

CREATE TABLE public.feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_project ON public.feedback USING btree (project_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. ERP / Back-office — suppliers, inventory, recipe costing, POs,
--    expenses, staff scheduling
-- ---------------------------------------------------------------------------
CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_project ON public.suppliers USING btree (project_id);

CREATE TABLE public.inventory_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text,
  unit text NOT NULL DEFAULT 'piece',
  qty_on_hand numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level numeric(12,3) NOT NULL DEFAULT 0,
  cost numeric(10,3) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_cost_check CHECK (cost >= 0)
);

CREATE INDEX idx_inventory_project ON public.inventory_items USING btree (project_id);
CREATE INDEX idx_inventory_low_stock ON public.inventory_items USING btree (project_id, qty_on_hand, reorder_level);

-- Recipe costing: how much of an inventory item a product consumes
CREATE TABLE public.ingredients (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  UNIQUE (product_id, inventory_item_id)
);

CREATE INDEX idx_ingredients_product ON public.ingredients USING btree (product_id);

CREATE TABLE public.purchase_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  total numeric(10,3) NOT NULL DEFAULT 0,
  expected_at timestamptz,
  received_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_project ON public.purchase_orders USING btree (project_id, created_at DESC);

CREATE TABLE public.purchase_order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(10,3) NOT NULL DEFAULT 0,
  CONSTRAINT purchase_order_items_cost_check CHECK (unit_cost >= 0)
);

CREATE INDEX idx_purchase_order_items_po ON public.purchase_order_items USING btree (purchase_order_id);

CREATE TABLE public.expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(10,3) NOT NULL CHECK (amount >= 0),
  description text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_project ON public.expenses USING btree (project_id, occurred_on DESC);

CREATE TABLE public.staff_shifts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  staff_member_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_shifts_project ON public.staff_shifts USING btree (project_id, start_at);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — every tenant-scoped table gates on is_project_member.
--    Billing plan catalog is public; staff tables are member-only (manager+
--    role enforcement happens at the API/server-action layer).
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_public_read ON public.subscription_plans FOR SELECT TO anon USING (is_active = true);
CREATE POLICY plans_authenticated_read ON public.subscription_plans FOR SELECT TO authenticated USING (true);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_member_all ON public.customers FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.loyalty_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_events_member_all ON public.loyalty_events FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_member_all ON public.campaigns FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_member_all ON public.feedback FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_member_all ON public.suppliers FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_items_member_all ON public.inventory_items FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY ingredients_member_all ON public.ingredients FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_member_all ON public.purchase_orders FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_items_member_all ON public.purchase_order_items FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
    FROM public.purchase_orders po
    WHERE (po.id = purchase_order_items.purchase_order_id)
      AND public.is_project_member(po.project_id))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM public.purchase_orders po
    WHERE (po.id = purchase_order_items.purchase_order_id)
      AND public.is_project_member(po.project_id))));

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_member_all ON public.expenses FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_shifts_member_all ON public.staff_shifts FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- 5. Grants — mirror existing pattern (grant-all, RLS does the gating)
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE public.subscription_plans TO anon;
GRANT ALL ON TABLE public.subscription_plans TO authenticated;
GRANT ALL ON TABLE public.subscription_plans TO service_role;

GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;

GRANT ALL ON TABLE public.loyalty_events TO authenticated;
GRANT ALL ON TABLE public.loyalty_events TO service_role;

GRANT ALL ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;

GRANT ALL ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;

GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;

GRANT ALL ON TABLE public.inventory_items TO authenticated;
GRANT ALL ON TABLE public.inventory_items TO service_role;

GRANT ALL ON TABLE public.ingredients TO authenticated;
GRANT ALL ON TABLE public.ingredients TO service_role;

GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;

GRANT ALL ON TABLE public.purchase_order_items TO authenticated;
GRANT ALL ON TABLE public.purchase_order_items TO service_role;

GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;

GRANT ALL ON TABLE public.staff_shifts TO authenticated;
GRANT ALL ON TABLE public.staff_shifts TO service_role;
