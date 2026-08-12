-- ============================================================================
-- 0009_impersonation_tokens_nullable.sql
-- Phase: Hotfix — impersonation end never persisted (security + correctness)
--
-- Symptom: /api/super-admin/impersonate/end returned 200 + the admin session
-- but the DB row was never marked ended and the stored tokens were never
-- revoked. endImpersonation() updates { ended_at, super_admin_session: null,
-- target_session: null } — but both token columns are jsonb NOT NULL, so the
-- whole UPDATE violated NOT NULL and PostgREST rejected it. The route ignored
-- the error (one-time read+null design) → ended_at stayed null and tokens
-- stayed revocable forever.
--
-- Fix: the "null after one use" design (audit CRITICAL fix) requires the
-- columns to be nullable.
-- ============================================================================

ALTER TABLE public.impersonation_sessions
  ALTER COLUMN super_admin_session DROP NOT NULL;

ALTER TABLE public.impersonation_sessions
  ALTER COLUMN target_session DROP NOT NULL;