-- Backend reliability and authorization follow-up.
-- Adds optional branch scope, enforces journal currency per project, and captures
-- order side effects atomically for a future/reliable worker.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Branch model and optional staff-to-branch scope.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{1,40}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS public.staff_branch_access (
  staff_member_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_member_id, branch_id),
  CONSTRAINT staff_branch_staff_same_project_fk
    FOREIGN KEY (project_id, staff_member_id)
    REFERENCES public.staff_members (project_id, id) ON DELETE CASCADE,
  CONSTRAINT staff_branch_branch_same_project_fk
    FOREIGN KEY (project_id, branch_id)
    REFERENCES public.branches (project_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_branch_access_project_branch
  ON public.staff_branch_access (project_id, branch_id, staff_member_id);

ALTER TABLE public.tables
  ADD CONSTRAINT tables_branch_same_project_fk
  FOREIGN KEY (project_id, branch_id)
  REFERENCES public.branches (project_id, id);

CREATE OR REPLACE FUNCTION public.can_access_project_branch(
  p_project_id uuid,
  p_branch_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.project_id = p_project_id
      AND sm.user_id = auth.uid()
      AND (
        sm.role = 'owner'
        OR p_branch_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.staff_branch_access sba
          WHERE sba.project_id = sm.project_id
            AND sba.staff_member_id = sm.id
        )
        OR EXISTS (
          SELECT 1 FROM public.staff_branch_access sba
          WHERE sba.project_id = sm.project_id
            AND sba.staff_member_id = sm.id
            AND sba.branch_id = p_branch_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_project_branch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_project_branch(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_branch_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY branches_member_read ON public.branches
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY branches_owner_manager_write ON public.branches
  FOR ALL TO authenticated
  USING (public.is_project_owner_or_manager(project_id))
  WITH CHECK (public.is_project_owner_or_manager(project_id));

CREATE POLICY staff_branch_access_member_read ON public.staff_branch_access
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY staff_branch_access_owner_write ON public.staff_branch_access
  FOR ALL TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

REVOKE ALL ON public.branches, public.staff_branch_access FROM anon;
GRANT SELECT ON public.branches, public.staff_branch_access TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branches, public.staff_branch_access TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Journal currency must match the project currency.
-- ---------------------------------------------------------------------------
UPDATE public.journal_entries je
SET currency_code = upper(p.currency)
FROM public.projects p
WHERE p.id = je.project_id
  AND (je.currency_code IS NULL OR je.currency_code = 'BHD');

CREATE OR REPLACE FUNCTION public.validate_journal_currency()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_currency text;
BEGIN
  SELECT upper(currency) INTO expected_currency
  FROM public.projects
  WHERE id = NEW.project_id;

  IF expected_currency IS NULL THEN
    RAISE EXCEPTION 'Project not found for journal entry';
  END IF;

  NEW.currency_code := upper(NEW.currency_code);
  IF NEW.currency_code IS DISTINCT FROM expected_currency THEN
    RAISE EXCEPTION 'Journal currency must match project currency';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_currency_guard ON public.journal_entries;
CREATE TRIGGER journal_entries_currency_guard
  BEFORE INSERT OR UPDATE OF project_id, currency_code
  ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_journal_currency();

-- ---------------------------------------------------------------------------
-- 3. Atomic order side-effect outbox.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('order.created')),
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (event_type, aggregate_id)
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
  ON public.event_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE OR REPLACE FUNCTION public.enqueue_order_created_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.event_outbox (project_id, event_type, aggregate_id, payload)
  VALUES (
    NEW.project_id,
    'order.created',
    NEW.id,
    jsonb_build_object(
      'order_id', NEW.id,
      'project_id', NEW.project_id,
      'status', NEW.status,
      'order_number', NEW.order_number
    )
  )
  ON CONFLICT (event_type, aggregate_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enqueue_created_event ON public.orders;
CREATE TRIGGER orders_enqueue_created_event
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_created_event();

ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_outbox FROM anon, authenticated;
GRANT ALL ON public.event_outbox TO service_role;

-- Existing project-level table policies remain valid for projects without
-- explicit staff branch assignments. Once a staff member has assignments,
-- table reads/writes are restricted to those branches.
DROP POLICY IF EXISTS tables_member_read ON public.tables;
CREATE POLICY tables_member_read ON public.tables
  FOR SELECT TO authenticated
  USING (public.can_access_project_branch(project_id, branch_id));

DROP POLICY IF EXISTS tables_insert ON public.tables;
CREATE POLICY tables_insert ON public.tables
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project_branch(project_id, branch_id));

DROP POLICY IF EXISTS tables_update ON public.tables;
CREATE POLICY tables_update ON public.tables
  FOR UPDATE TO authenticated
  USING (public.can_access_project_branch(project_id, branch_id))
  WITH CHECK (public.can_access_project_branch(project_id, branch_id));

DROP POLICY IF EXISTS tables_delete ON public.tables;
CREATE POLICY tables_delete ON public.tables
  FOR DELETE TO authenticated
  USING (public.can_access_project_branch(project_id, branch_id));

COMMIT;
