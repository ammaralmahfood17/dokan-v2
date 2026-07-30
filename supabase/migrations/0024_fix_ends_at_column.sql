-- ============================================================================
-- Migration 0024 — Fix `ends_at` → `current_period_end` in place_order RPC
-- ============================================================================
-- Historical note: 0017 briefly referenced a non-existent column `ends_at`.
-- The authoritative place_order definition (using current_period_end and
-- accepting both active + trialing) lives in 0028_audit_fixes.sql.
-- This file is a sequential no-op so migration history stays contiguous.
-- ============================================================================
select 1;

