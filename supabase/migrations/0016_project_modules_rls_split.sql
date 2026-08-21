-- ============================================================================
-- 0016_project_modules_rls_split.sql
-- Fix DOK-001: project_modules_member_all used FOR ALL — any member could
-- enable/disable modules. Split into 4 granular policies (SELECT member,
-- INSERT/UPDATE/DELETE owner/manager only).
--
-- DOK-002: is_core lock only enforced at app route; add DB trigger to block
-- disabling core modules regardless of who calls the row.
-- ============================================================================

DROP POLICY IF EXISTS project_modules_member_all ON public.project_modules;

CREATE POLICY project_modules_member_select ON public.project_modules
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE POLICY project_modules_owner_insert ON public.project_modules
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));

CREATE POLICY project_modules_owner_update ON public.project_modules
  FOR UPDATE TO authenticated
  USING (public.is_project_owner_or_manager(project_id))
  WITH CHECK (public.is_project_owner_or_manager(project_id));

CREATE POLICY project_modules_owner_delete ON public.project_modules
  FOR DELETE TO authenticated
  USING (public.is_project_owner_or_manager(project_id));

CREATE OR REPLACE FUNCTION public.prevent_core_module_toggle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT is_core FROM public.modules WHERE id = NEW.module_id) AND NOT NEW.is_enabled THEN
    RAISE EXCEPTION 'Core module cannot be disabled';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS project_modules_core_lock ON public.project_modules;
CREATE TRIGGER project_modules_core_lock
  BEFORE UPDATE ON public.project_modules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_core_module_toggle();
