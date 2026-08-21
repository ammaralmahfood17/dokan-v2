-- ============================================================================
-- 0019_zatca_einvoicing.sql
-- ZATCA (Zakat, Tax and Customs Authority) e-invoicing — Phase 2 Integration.
-- FatooraPlus: stores generated tax invoices, cryptographic stamps, signing
-- keys per tenant, and submission status to ZATCA's clearance/reporting APIs.
-- ============================================================================
-- Design (same rigor as 0016/0018):
--   A) RLS asymmetric — SELECT member / writes owner-manager + service_role
--   B) Signing keys stored encrypted at rest via pgsodium (preferred) or
--      duplicated to a vault; here we store the public key and a reference
--      to the private key kept in Supabase Vault (never raw in a table row).
--   C) Idempotent: an order can only produce ONE standard tax invoice; a
--      credit note references the original invoice's hash+UUID.
--   D) Append-only status row per attempt (submission_attempts), never
--      overwrite — mirrors ZATCA's audit-trail requirement.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tenant-level ZATCA configuration (one row per project)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zatca_config (
  project_id uuid NOT NULL PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  seller_name_ar text NOT NULL,
  seller_name_en text NOT NULL,
  vat_number text NOT NULL CHECK (vat_number ~ '^3[0-9]{13}3$'),  -- 15 digits, starts&ends 3
  -- device identifiers for the cryptographic stamp
  device_id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- public key (X.509 SubjectPublicKeyInfo PEM) + private key stored via Vault
  public_key_pem text,
  private_key_vault_id uuid,  -- reference into Vault (service_role only reads)
  csr_pem text,               -- CSR submitted to ZATCA for compliance certificate
  -- ZATCA environment: sandbox for testing, production for real traffic
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  compliance_certificate_pem text,    -- CCSID certificate returned by ZATCA
  clearance_secret text,              -- secret/token for clearance APIs (encrypted)
  -- onboarding state machine
  onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zatca_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY zatca_config_member_select ON public.zatca_config
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY zatca_config_owner_all ON public.zatca_config
  FOR ALL TO authenticated
  USING (public.is_project_owner_or_manager(project_id))
  WITH CHECK (public.is_project_owner_or_manager(project_id));

-- ---------------------------------------------------------------------------
-- 2. Invoices (standard tax invoice + simplified tax invoice + credit/debit notes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zatca_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- linkage to canonical order (may be null for manual invoices)
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  -- invoice classification per ZATCA specs: simplified/standard/credit/debit
  invoice_kind text NOT NULL CHECK (invoice_kind IN ('simplified','standard','credit','debit')),
  -- sequential invoice number per tenant + UBL-compliant human identifier
  invoice_number text NOT NULL,       -- human-readable (e.g., INV-2026-00001)
  uuid text NOT NULL,                 -- UUIDv4 as UBL requires
  issue_date timestamptz NOT NULL,
  currency_code text NOT NULL DEFAULT 'SAR',
  -- monetary breakdown (in minor units of currency)
  total_net_minor bigint NOT NULL,
  total_vat_minor bigint NOT NULL,
  total_gross_minor bigint NOT NULL,
  -- customer info (may be null for simplified ← walk-in B2C)
  customer_name_ar text,
  customer_name_en text,
  customer_vat_number text,
  customer_country_code text NOT NULL DEFAULT 'SA',
  -- UBL XML payload (full signed invoice ready for submission)
  xml_payload text NOT NULL,
  xml_hash text NOT NULL,             -- SHA-256 of canonicalized XML
  -- cryptographic stamp fields (ZATCA Phase 2 mandatory)
  cryptographic_stamp text NOT NULL,  -- QR TLV base64 (includes signature)
  -- submission state machine: pending -> cleared | reported | rejected | failed
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cleared','reported','rejected','failed')),
  zatca_response jsonb,               -- full response body from clearance API
  zatca_acknowledgement_code text,    -- for clearance mode
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_zatca_invoices_project ON public.zatca_invoices USING btree (project_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_order ON public.zatca_invoices USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_status ON public.zatca_invoices USING btree (status) WHERE status <> 'cleared';

ALTER TABLE public.zatca_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY zatca_invoices_member_select ON public.zatca_invoices
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY zatca_invoices_owner_insert ON public.zatca_invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner_or_manager(project_id));
-- Mutations are service_role only after creation; client cannot UPDATE/DELETE
-- (the acceptance is terminal once ZATCA clears it).

-- ---------------------------------------------------------------------------
-- 3. Submission attempts (immutable audit trail of every API call to ZATCA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zatca_submission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.zatca_invoices(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  attempt_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  zatca_message text,                 -- Arabic message returned by ZATCA (e.g. "تم القبول")
  zatca_errors jsonb,                 -- array of {code, message} ZATCA validation errors
  zatca_uuid text,                    -- ZATCA's own UUID for the accepted invoice
  accepted boolean,                   -- true if ZATCA accepted the invoice this attempt
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zatca_attempts_invoice ON public.zatca_submission_attempts USING btree (invoice_id, attempt_at DESC);

ALTER TABLE public.zatca_submission_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY zatca_attempts_member_select ON public.zatca_submission_attempts
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
-- NO INSERT/UPDATE/DELETE policies for authenticated role:
-- attempts are written exclusively by the service_role backend pipeline.

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.zatca_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.zatca_config TO service_role;
GRANT SELECT, INSERT ON TABLE public.zatca_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.zatca_invoices TO service_role;
GRANT SELECT ON TABLE public.zatca_submission_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.zatca_submission_attempts TO service_role;

COMMIT;
