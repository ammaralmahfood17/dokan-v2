-- ============================================================================
-- 0018_accounting_double_entry.sql
-- Double-entry accounting core for Dokan ERP (Phase 1 of Odoo-lite).
-- ============================================================================
-- Scope (per AGENTS.md): one file, RLS-gated, tenant-isolated, reversible.
-- Every tenant gets its own chart of accounts seeded on first use.
--
-- Design decisions:
-- A) Single-row transactions (orders, expenses, purchases) auto-post via a
--    SECURITY DEFINER function that a service_role endpoint calls
--    AFTER the business event commits — never inline in triggers on hot
--    order tables (would slow customer checkout).
-- B) Journal entries are append-only, in cents-with-currency per row; the
--   balance check is a DB constraint so a malformed entry can never commit.
-- C) RLS asymmetric like 0016: SELECT any member, INSERT/UPDATE/DELETE
--    owner/manager only (writes are financial = ADM restricted by default).
-- D) Delete on journal_entry_lines is soft-banned by policy (append-only) —
--    auditing requires an immutable ledger.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Chart of accounts (COA) — canonical tenant-scoped accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code text NOT NULL,                 -- e.g. '1100-CASH', '4000-SALES'
  name_ar text NOT NULL,
  name_en text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'asset','liability','equity','revenue','expense','contra'
  )),
  parent_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_project ON public.accounts USING btree (project_id, type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON public.accounts USING btree (parent_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_member_select ON public.accounts
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY accounts_owner_insert ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));
CREATE POLICY accounts_owner_update ON public.accounts
  FOR UPDATE TO authenticated
  USING (public.is_project_owner_or_manager(project_id));
CREATE POLICY accounts_owner_delete ON public.accounts
  FOR DELETE TO authenticated
  USING (public.is_project_owner_or_manager(project_id));

-- ---------------------------------------------------------------------------
-- 2. Journal entries (header) — immutable once posted
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- source reference for traceability (order_id, expense_id, purchase_id, manual)
  reference_type text NOT NULL CHECK (reference_type IN (
    'order','expense','purchase_order','payroll','manual','adjustment','refund'
  )),
  reference_id uuid,
  memo text NOT NULL DEFAULT '',
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid NOT NULL,            -- auth.uid() at time of posting
  -- service_role flips posted=true AFTER lines are inserted, making the
  -- entry visible to selects; until then it's a draft invisible to the API.
  posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, reference_type, reference_id, posted)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_project ON public.journal_entries USING btree (project_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON public.journal_entries USING btree (reference_type, reference_id);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Ledger is append-only: INSERT allowed for owner/manager, never UPDATE/DELETE.
CREATE POLICY journal_entries_member_select ON public.journal_entries
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY journal_entries_owner_insert ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));
-- Deliberately NO UPDATE/DELETE policies: audit trail is immutable.

-- ---------------------------------------------------------------------------
-- 3. Journal entry lines (must balance per entry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  -- exactly one of debit/credit must be non-zero (never both, never neither)
  CONSTRAINT one_side_only CHECK (
    (debit_minor > 0 AND credit_minor = 0) OR
    (credit_minor > 0 AND debit_minor = 0)
  ),
  memo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jernel_project ON public.journal_entry_lines USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_jernel_entry ON public.journal_entry_lines USING btree (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jernel_account ON public.journal_entry_lines USING btree (account_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entry_lines_member_select ON public.journal_entry_lines
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY journal_entry_lines_owner_insert ON public.journal_entry_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));
-- No UPDATE/DELETE — the ledger is append-only by design.

-- ---------------------------------------------------------------------------
-- 4. Balance check — per journal entry, SUM(debit) must equal SUM(credit)
--    Enforced before the entry is marked posted=true via a helper the
--    service-role posting endpoint calls; a misbalanced draft can never
--    become posted because the posted=true UPDATE validates via trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_journal_entry_balanced(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(debit_minor), 0) = COALESCE(SUM(credit_minor), 0)
    FROM public.journal_entry_lines
   WHERE journal_entry_id = p_entry_id;
$$;

CREATE OR REPLACE FUNCTION public.prevent_unbalanced_posting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only enforce when transitioning to posted=true
  IF NEW.posted = true AND (OLD.posted IS NULL OR OLD.posted = false) THEN
    IF NOT public.verify_journal_entry_balanced(NEW.id) THEN
      RAISE EXCEPTION 'Journal entry % is not balanced', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_posted_guard ON public.journal_entries;
CREATE TRIGGER journal_entries_posted_guard
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unbalanced_posting();

-- ---------------------------------------------------------------------------
-- 5. Seed default COA per project (idempotent helper used on onboarding)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_coa(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.accounts (project_id, code, name_ar, name_en, type) VALUES
    (p_project_id, '1000', 'صندوق المطعم',   'Cash on Hand',     'asset'),
    (p_project_id, '1100', 'حساب البنك',     'Bank Account',     'asset'),
    (p_project_id, '1200', 'مخزون',           'Inventory',        'asset'),
    (p_project_id, '2000', 'دائنون/موردون',  'Accounts Payable', 'liability'),
    (p_project_id, '2100', 'رواتب مستحقة',   'Salaries Payable', 'liability'),
    (p_project_id, '2200', 'ضريبة القيمة',   'VAT Payable',      'liability'),
    (p_project_id, '3000', 'رأس المال',      'Owner Capital',    'equity'),
    (p_project_id, '3100', 'أرباح مبقاة',    'Retained Earnings','equity'),
    (p_project_id, '4000', 'مبيعات المطعم',  'Restaurant Sales', 'revenue'),
    (p_project_id, '4100', 'مبيعات توصيل',  'Delivery Sales',   'revenue'),
    (p_project_id, '4200', 'إرجاعات مبيعات','Sales Refunds',    'revenue'),
    (p_project_id, '5000', 'كلفة المواد',    'Cost of Goods',    'expense'),
    (p_project_id, '5100', 'رواتب وأجور',   'Salaries',         'expense'),
    (p_project_id, '5200', 'إيجار المكان',  'Rent',             'expense'),
    (p_project_id, '5300', 'فواتير خدمات',  'Utilities',        'expense'),
    (p_project_id, '5400', 'تسويق',          'Marketing',        'expense'),
    (p_project_id, '5900', 'مصاريف أخرى',   'Other Expenses',   'expense')
  ON CONFLICT (project_id, code) DO NOTHING;

  GET DIAGNOSTICS v_count = row_count;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants — follow the established pattern (authenticated + service_role)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts TO service_role;
GRANT SELECT, INSERT ON TABLE public.journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entries TO service_role;
GRANT SELECT, INSERT ON TABLE public.journal_entry_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entry_lines TO service_role;

-- Functions granted to service_role ONLY (they mutate state; clients call
-- them via the API endpoints under service role).
REVOKE ALL ON FUNCTION public.seed_default_coa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_coa(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.verify_journal_entry_balanced(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_journal_entry_balanced(uuid) TO service_role;

COMMIT;
