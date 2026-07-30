-- ============================================================================
-- Migration 0025 — get_menu_by_qr availability
-- ============================================================================
-- Historical note: unavailable products are returned with is_available=false
-- so the client can render an "out of stock" state. Filtering them out
-- entirely was considered and rejected for UX reasons.
-- This file is a sequential no-op so migration history stays contiguous.
-- ============================================================================
select 1;

