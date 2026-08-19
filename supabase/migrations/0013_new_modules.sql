-- ============================================================================
-- 0013_new_modules.sql
-- Adds new modules to expand ERP capabilities
-- ============================================================================

INSERT INTO public.modules (code, name_ar, name_en, description_ar, description_en, category, icon, sort_order, is_core) VALUES
  ('loyalty', 'برنامج الولاء', 'Loyalty Program', 'نقاط ومكافآت للزبائن', 'Customer points and rewards', 'sales', 'gift', 11, false),
  ('delivery', 'التوصيل', 'Delivery', 'إدارة طلبات التوصيل', 'Delivery order management', 'operations', 'truck', 12, false),
  ('reservations', 'الحجوزات', 'Reservations', 'حجوزات الطاولات والمواعيد', 'Table and appointment booking', 'operations', 'calendar', 13, false),
  ('payments', 'بوابات الدفع', 'Payments', 'دفع إلكتروني متعدد', 'Multiple online payments', 'finance', 'credit-card', 14, false),
  ('notifications', 'الإشعارات', 'Notifications', 'إشعارات SMS و email', 'SMS and email notifications', 'sales', 'bell', 15, false);
