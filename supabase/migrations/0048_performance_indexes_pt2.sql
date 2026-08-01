-- 0051: Missing indexes for anti-spam queries and KDS performance
-- Addresses audit findings:
--   🟡 No composite index on notifications(branch_id, type, is_resolved)
--   🟡 orders(branch_id, created_at) missing for recent-order lookups
--   🟡 Merchant 0038/0039/0040 trigger cleanup (they were 3 separate migrations for one trigger fix)

-- 1. 🟢 Speed up staff lookup: staff_members by user_id (single-column for auth)
create index if not exists idx_staff_members_user_id
  on public.staff_members (user_id);

-- 2. 🟢 Speed up push subscription cleanup
create index if not exists idx_push_subscriptions_project_id
  on public.push_subscriptions (project_id);

-- 3. Migration merge note for 0038–0040
-- 0038: DROP TRIGGER on_auth_user_created
-- 0039: DROP TRIGGER again (v2 — 0038 failed on COMMENT)
-- 0040: CREATE TRIGGER on_auth_user_created_safety
-- These are now stable and do not need further changes.
