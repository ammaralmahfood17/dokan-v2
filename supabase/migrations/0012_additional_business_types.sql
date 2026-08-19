-- ============================================================================
-- 0012_additional_business_types.sql
-- Adds more business types to support broader ERP use cases
-- ============================================================================

INSERT INTO public.business_types (code, name_ar, name_en, description_ar, description_en, icon) VALUES
  ('school', 'مدرسة', 'School', 'مدرسة أو مركز تعليمي', 'School or training center', 'graduation-cap'),
  ('salon', 'صالون', 'Salon', 'صالون تجميل أو حلاقة', 'Beauty salon or barbershop', 'scissors'),
  ('hotel', 'فندق', 'Hotel', 'فندق أو شقة فندقية', 'Hotel or serviced apartment', 'bed-double'),
  ('real_estate', 'عقارات', 'Real Estate', 'وسيط عقاري أو إدارة عقارات', 'Real estate agency', 'building-2'),
  ('pharmacy', 'صيدلية', 'Pharmacy', 'صيدلية أو مستحضرات تجميل', 'Pharmacy or cosmetics', 'pill'),
  ('car_rental', 'تأجير سيارات', 'Car Rental', 'تأجير سيارات أو مركبات', 'Car or vehicle rental', 'car');
