-- ============================================================================
-- 0020_rate_limits_lockdown.sql
-- B4: جدول rate_limits داخلي — يجب ألا يصل إليه anon/authenticated إطلاقًا.
-- المشكلة: baseline (0000) يمنح ALL لـ anon + authenticated، مما يعني أن أي
-- زائر أو مستخدم مسجل يستطيع:
--   1) قراءة مفاتيح rate limit لجميع المتاجر (تسريب معلومات عن نشاط منافس)،
--   2) حذف سجلات rate limit (تعطيل حماية anti-spam)،
--   3) حقن سجلات وهمية (حرمان آخرين من الخدمة).
-- rateLimit() يكتب عبر service_role (src/lib/rate-limit.ts → createAdminClient)
-- لذا REVOKE من anon/authenticated لا يكسر أي مسار شرعي.
-- ============================================================================

REVOKE ALL ON TABLE public.rate_limits FROM anon;
REVOKE ALL ON TABLE public.rate_limits FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limits TO service_role;
