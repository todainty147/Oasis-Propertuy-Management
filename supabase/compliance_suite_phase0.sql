-- =============================================================================
-- Compliance & Risk Suite — Phase 0 Foundation
-- =============================================================================
-- Scope: table structures, RLS, ai_insights constraint expansion, and the
-- updated account_feature_required_plan function for compliance feature keys.
--
-- RLS pattern: every policy uses user_can_manage_account(account_id), the
-- project-standard SECURITY DEFINER guard — see baseline_schema.sql for the
-- function definition. Never use a raw subquery on account_members.
--
-- No AI calls, no edge functions, no document extraction in this phase.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. compliance_items: add tax-specific columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.compliance_items
  ADD COLUMN IF NOT EXISTS jurisdiction     TEXT,
  ADD COLUMN IF NOT EXISTS tax_filing_type  TEXT,
  ADD COLUMN IF NOT EXISTS deadline_date    DATE,
  ADD COLUMN IF NOT EXISTS filed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filing_reference TEXT;

COMMENT ON COLUMN public.compliance_items.jurisdiction     IS 'ISO country code for tax jurisdiction: GB, PL, DE';
COMMENT ON COLUMN public.compliance_items.tax_filing_type  IS 'Filing type key e.g. vat_return, income_tax, ptc, grundsteuer';
COMMENT ON COLUMN public.compliance_items.deadline_date    IS 'Statutory or self-imposed filing deadline';
COMMENT ON COLUMN public.compliance_items.filed_at         IS 'Timestamp the filing was marked as submitted';
COMMENT ON COLUMN public.compliance_items.filing_reference IS 'Reference number returned by HMRC/US/DE authority or accountant';

-- ---------------------------------------------------------------------------
-- 2. tax_records
-- Holds income/expense/adjustment/evidence rows derived from payments,
-- ledger entries, documents, or manual entries. Not a tax filing system.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tax_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  property_id       UUID        REFERENCES public.properties(id)           ON DELETE SET NULL,
  tenant_id         UUID        REFERENCES public.tenants(id)              ON DELETE SET NULL,
  payment_id        UUID        REFERENCES public.payments(id)             ON DELETE SET NULL,
  ledger_entry_id   UUID,
  document_id       UUID        REFERENCES public.documents(id)            ON DELETE SET NULL,
  country_code      TEXT        NOT NULL,
  record_type       TEXT        NOT NULL
    CHECK (record_type IN ('income', 'expense', 'adjustment', 'evidence')),
  amount            NUMERIC(12, 2),
  currency          TEXT        NOT NULL DEFAULT 'GBP',
  tax_category_code TEXT,
  tax_treatment     TEXT        NOT NULL DEFAULT 'review_required'
    CHECK (tax_treatment IN (
      'likely_allowable',
      'likely_disallowable',
      'review_required',
      'capital_candidate',
      'evidence_only'
    )),
  source_table      TEXT,
  source_id         UUID,
  record_date       DATE        NOT NULL,
  description       TEXT,
  evidence_status   TEXT        NOT NULL DEFAULT 'missing'
    CHECK (evidence_status IN ('missing', 'partial', 'complete')),
  review_status     TEXT        NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'reviewed', 'excluded')),
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tax_records IS
  'Income/expense/evidence rows for tax readiness. '
  'Not a tax filing system. Does not constitute tax advice.';

ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_records_account_member ON public.tax_records;
CREATE POLICY tax_records_account_member ON public.tax_records
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_tax_records_account_id
  ON public.tax_records (account_id);
CREATE INDEX IF NOT EXISTS idx_tax_records_property_id
  ON public.tax_records (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tax_records_record_date
  ON public.tax_records (account_id, record_date);
CREATE INDEX IF NOT EXISTS idx_tax_records_country_code
  ON public.tax_records (account_id, country_code);

-- ---------------------------------------------------------------------------
-- 3. tax_exports
-- Accountant export history and export payload metadata.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tax_exports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  country_code  TEXT        NOT NULL,
  tax_mode      TEXT        NOT NULL,
  period_label  TEXT        NOT NULL,
  export_type   TEXT        NOT NULL
    CHECK (export_type IN ('csv', 'json', 'pdf_summary')),
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  generated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at  TIMESTAMPTZ,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tax_exports IS
  'Records of accountant-oriented data exports. '
  'Does not constitute a tax return or government submission.';

ALTER TABLE public.tax_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_exports_account_member ON public.tax_exports;
CREATE POLICY tax_exports_account_member ON public.tax_exports
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_tax_exports_account_id
  ON public.tax_exports (account_id);

-- ---------------------------------------------------------------------------
-- 4. rent_shield_assessments
-- Operational payment-health snapshots per property per period.
-- shield_score (0–100) is computed deterministically from payment data.
-- ai_narrative is an optional explainer added by a future AI phase.
-- This is not insurance, not credit scoring, not financial advice.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rent_shield_assessments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES public.accounts(id)   ON DELETE CASCADE,
  property_id      UUID        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  period           TEXT        NOT NULL,
  shield_score     SMALLINT    NOT NULL CHECK (shield_score BETWEEN 0 AND 100),
  shield_tier      TEXT        NOT NULL
    CHECK (shield_tier IN ('strong', 'moderate', 'elevated', 'critical')),
  arrears_amount   NUMERIC(12, 2),
  days_overdue_p90 SMALLINT,
  ai_narrative     TEXT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt_version   TEXT,
  UNIQUE (account_id, property_id, period)
);

COMMENT ON TABLE public.rent_shield_assessments IS
  'Operational rent-payment health snapshots. '
  'Not insurance, not credit scoring, not financial advice. '
  'Deterministic score only; AI narrative (when present) explains pre-computed factors.';

ALTER TABLE public.rent_shield_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rent_shield_account_member ON public.rent_shield_assessments;
CREATE POLICY rent_shield_account_member ON public.rent_shield_assessments
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_rent_shield_account_id
  ON public.rent_shield_assessments (account_id);
CREATE INDEX IF NOT EXISTS idx_rent_shield_property_id
  ON public.rent_shield_assessments (property_id);
CREATE INDEX IF NOT EXISTS idx_rent_shield_period
  ON public.rent_shield_assessments (account_id, period);

-- ---------------------------------------------------------------------------
-- 5. lease_audits
-- One audit run per lease. ai_insights is used as a cache reference only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lease_audits (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lease_id       UUID        NOT NULL REFERENCES public.leases(id)   ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'stale')),
  overall_risk   TEXT
    CHECK (overall_risk IN ('low', 'medium', 'high', 'critical')),
  summary        TEXT,
  prompt_version TEXT,
  source_hash    TEXT,
  requested_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.lease_audits IS
  'Structured lease audit results. ai_insights used for cache only. '
  'Full text extraction deferred until document OCR layer is available.';

ALTER TABLE public.lease_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lease_audits_account_member ON public.lease_audits;
CREATE POLICY lease_audits_account_member ON public.lease_audits
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_lease_audits_account_id
  ON public.lease_audits (account_id);
CREATE INDEX IF NOT EXISTS idx_lease_audits_lease_id
  ON public.lease_audits (lease_id);

-- ---------------------------------------------------------------------------
-- 6. lease_audit_findings
-- Individual clause findings for a lease_audit. Can be dismissed by managers.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lease_audit_findings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID        NOT NULL REFERENCES public.accounts(id)     ON DELETE CASCADE,
  lease_audit_id UUID        NOT NULL REFERENCES public.lease_audits(id) ON DELETE CASCADE,
  clause_ref     TEXT,
  clause_text    TEXT,
  risk_level     TEXT        NOT NULL
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  category       TEXT,
  explanation    TEXT,
  dismissed      BOOLEAN     NOT NULL DEFAULT FALSE,
  dismissed_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.lease_audit_findings IS
  'Per-clause findings for a lease_audit. '
  'Findings can be dismissed by account managers and are auditable.';

ALTER TABLE public.lease_audit_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lease_audit_findings_account_member ON public.lease_audit_findings;
CREATE POLICY lease_audit_findings_account_member ON public.lease_audit_findings
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_lease_audit_findings_account_id
  ON public.lease_audit_findings (account_id);
CREATE INDEX IF NOT EXISTS idx_lease_audit_findings_lease_audit_id
  ON public.lease_audit_findings (lease_audit_id);

-- ---------------------------------------------------------------------------
-- 7. ai_insights: expand insight_type CHECK
--
-- The original schema defined only 'attention_briefing'. The edge functions
-- deployed in previous phases insert five distinct values. This migration
-- reconciles the schema with the live data and adds the two Phase 0 types.
-- All seven values must be present or the constraint will fail against
-- existing rows.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_insights DROP CONSTRAINT IF EXISTS ai_insights_type_check;
ALTER TABLE public.ai_insights ADD CONSTRAINT ai_insights_type_check
  CHECK (insight_type IN (
    'attention_briefing',
    'contractor_recommendation',
    'maintenance_triage_suggestion',
    'property_health_explainer',
    'weekly_portfolio_summary_ai',
    'lease_clause_audit',
    'rent_shield_explainer'
  ));

-- ---------------------------------------------------------------------------
-- 8. account_feature_required_plan: compliance feature keys
--
-- CANONICAL DEFINITION consolidated into account_entitlements.sql (L-001 resolved).
-- account_entitlements.sql now includes all keys: core, AI, and compliance.
-- This file no longer redefines the function — apply account_entitlements.sql first.
-- ---------------------------------------------------------------------------
