-- ============================================================================
-- 0011_business_type_and_modular_onboarding.sql
-- Adds business_type + modular system to Dokan v2
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. business_types — tipos de negocio soportados
-- ---------------------------------------------------------------------------
CREATE TABLE public.business_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_types IS 'Catalog of supported business types (restaurant, retail, clinic, etc.)';

INSERT INTO public.business_types (code, name_ar, name_en, description_ar, description_en, icon) VALUES
  ('restaurant', 'مطعم', 'Restaurant', 'مطعم أو مقهى', 'Restaurant or café', 'utensils'),
  ('retail', 'متجر تجاري', 'Retail Store', 'محل تجاري للمنتجات', 'Retail store for products', 'store'),
  ('clinic', 'عيادة', 'Clinic', 'عيادة طبية أو صيدلية', 'Medical clinic or pharmacy', 'heart-pulse'),
  ('service', 'خدمات', 'Services', 'مكتب خدمات أو استشاري', 'Service or consulting office', 'briefcase'),
  ('grocery', 'بقالة', 'Grocery', 'بقالة أو سوبرماركت', 'Grocery store or supermarket', 'shopping-cart'),
  ('fitness', 'نادي رياضي', 'Fitness', 'نادي رياضي أو صالة', 'Gym or fitness center', 'dumbbell'),
  ('school', 'مدرسة', 'School', 'مدرسة أو مركز تعليمي', 'School or training center', 'graduation-cap'),
  ('salon', 'صالون', 'Salon', 'صالون تجميل أو حلاقة', 'Beauty salon or barbershop', 'scissors'),
  ('hotel', 'فندق', 'Hotel', 'فندق أو شقة فندقية', 'Hotel or serviced apartment', 'bed-double'),
  ('real_estate', 'عقارات', 'Real Estate', 'وسيط عقاري أو إدارة عقارات', 'Real estate agency', 'building-2'),
  ('pharmacy', 'صيدلية', 'Pharmacy', 'صيدلية أو مستحضرات تجميل', 'Pharmacy or cosmetics', 'pill'),
  ('car_rental', 'تأجير سيارات', 'Car Rental', 'تأجير سيارات أو مركبات', 'Car or vehicle rental', 'car');

-- ---------------------------------------------------------------------------
-- 2. modules — unidades modulares opcionales
-- ---------------------------------------------------------------------------
CREATE TABLE public.modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  category text NOT NULL DEFAULT 'general',
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_core boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.modules IS 'Available modules that can be activated per project (CRM, inventory, accounting, etc.)';

INSERT INTO public.modules (code, name_ar, name_en, description_ar, description_en, category, icon, sort_order, is_core) VALUES
  ('pos', 'نقطة البيع', 'Point of Sale', 'إدارة المبيعات والدفع', 'Sales and payment management', 'sales', 'credit-card', 1, true),
  ('menu_qr', 'قائمة QR', 'QR Menu', 'قائمة رقمية للزبائن', 'Digital menu for customers', 'sales', 'qr-code', 2, true),
  ('kds', 'شاشة المطبخ', 'Kitchen Display', 'شاشة عرض للطلبات', 'Kitchen order display', 'operations', 'monitor', 3, false),
  ('crm', 'إدارة العملاء', 'CRM', 'تتبع العملاء والولاء', 'Customer tracking and loyalty', 'sales', 'users', 4, false),
  ('inventory', 'المخزون', 'Inventory', 'تتبع المنتجات والكميات', 'Product and quantity tracking', 'operations', 'package', 5, false),
  ('accounting', 'المحاسبة', 'Accounting', 'فواتير ومدفوعات ومصروفات', 'Invoices, payments, and expenses', 'finance', 'calculator', 6, false),
  ('reports', 'التقارير', 'Reports', 'تقارير المبيعات والأداء', 'Sales and performance reports', 'analytics', 'bar-chart-3', 7, false),
  ('staff', 'الموظفين', 'Staff Management', 'إدارة الموظفين والجدول', 'Employee and schedule management', 'operations', 'user-check', 8, false),
  ('marketing', 'التسويق', 'Marketing', 'حملات تسويقية', 'Marketing campaigns', 'sales', 'megaphone', 9, false),
  ('suppliers', 'الموردين', 'Suppliers', 'إدارة الموردين', 'Supplier management', 'operations', 'truck', 10, false);

-- ---------------------------------------------------------------------------
-- 3. project_modules — modules activated per project
-- ---------------------------------------------------------------------------
CREATE TABLE public.project_modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid,
  UNIQUE (project_id, module_id)
);

CREATE INDEX idx_project_modules_project ON public.project_modules USING btree (project_id);
CREATE INDEX idx_project_modules_module ON public.project_modules USING btree (module_id);

-- ---------------------------------------------------------------------------
-- 4. extend projects with business_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN business_type_id uuid REFERENCES public.business_types(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_business_type ON public.projects USING btree (business_type_id);

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_types_public_read ON public.business_types FOR SELECT TO anon USING (is_active = true);
CREATE POLICY business_types_authenticated_read ON public.business_types FOR SELECT TO authenticated USING (is_active = true);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY modules_public_read ON public.modules FOR SELECT TO anon USING (is_active = true);
CREATE POLICY modules_authenticated_read ON public.modules FOR SELECT TO authenticated USING (is_active = true);

ALTER TABLE public.project_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_modules_member_all ON public.project_modules FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE public.business_types TO anon;
GRANT ALL ON TABLE public.business_types TO authenticated;
GRANT ALL ON TABLE public.business_types TO service_role;

GRANT ALL ON TABLE public.modules TO anon;
GRANT ALL ON TABLE public.modules TO authenticated;
GRANT ALL ON TABLE public.modules TO service_role;

GRANT ALL ON TABLE public.project_modules TO authenticated;
GRANT ALL ON TABLE public.project_modules TO service_role;
