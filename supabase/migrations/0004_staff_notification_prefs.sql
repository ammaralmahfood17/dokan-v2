-- ============================================================================
-- 0004_staff_notification_prefs.sql
-- Per-staff notification channel control (item 3 of the notifications plan).
--
-- 1. staff_members.notify_push / notify_telegram — each staff member chooses
--    which channels receive order alerts (default: both ON).
-- 2. telegram_links.user_id — the webhook now records WHO created the link
--    code (telegram_link_codes.created_by), so user-linked chats can be
--    scoped to that staff member's telegram pref. Group chats and legacy
--    links stay NULL (project-level channel: always receives alerts).
-- 3. RLS/GRANT hardening on staff_members (same family as 0001):
--    a. Blanket GRANT ALL ... TO authenticated is revoked; re-granted as
--       SELECT / INSERT / DELETE + column-scoped UPDATE (notify_push,
--       notify_telegram) only. No code path updates other staff columns
--       today (only onboarding INSERTs), and this closes the path where a
--       staff member could self-elevate role/project via an UPDATE.
--    b. staff_update_owner gains WITH CHECK mirroring USING — an owner can
--       no longer reparent a staff row into a project they don't own.
--    c. NEW staff_update_own_prefs: a staff member can UPDATE only their own
--       row (USING == WITH CHECK == user_id = auth.uid()).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-staff notification preferences (default: everything ON).
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_members
  ADD COLUMN notify_push boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_telegram boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. telegram_links.user_id — who linked this chat (NULL = group/legacy).
-- ---------------------------------------------------------------------------
ALTER TABLE public.telegram_links
  ADD COLUMN user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 3a. Replace blanket authenticated grants with precise ones.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.staff_members FROM authenticated;

GRANT SELECT ON TABLE public.staff_members TO authenticated;
-- staff_insert_first_owner / staff_insert_by_owner (onboarding + owner adds)
GRANT INSERT ON TABLE public.staff_members TO authenticated;
-- staff_delete_owner
GRANT DELETE ON TABLE public.staff_members TO authenticated;
-- Column-scoped: staff (and owners) may only touch their own pref columns via
-- UPDATE. role/project_id/name are immutable through the API for now.
GRANT UPDATE (notify_push, notify_telegram) ON TABLE public.staff_members TO authenticated;

-- ---------------------------------------------------------------------------
-- 3b. staff_update_owner — WITH CHECK must mirror USING (anti-reparenting).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_update_owner ON public.staff_members;
CREATE POLICY staff_update_owner ON public.staff_members
  FOR UPDATE
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- 3c. staff_update_own_prefs — self-service channel toggles.
--     Column grant (notify_*) + this row policy = staff can flip ONLY their
--     own notification flags, nothing else.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_update_own_prefs ON public.staff_members;
CREATE POLICY staff_update_own_prefs ON public.staff_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
