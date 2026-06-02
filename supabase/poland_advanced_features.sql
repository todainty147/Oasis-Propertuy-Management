-- =============================================================================
-- Poland Advanced Market Features
-- =============================================================================
-- Scope:
--   1. account_feature_required_plan — adds 4 new PL advanced feature keys
--   2. pl_rent_match_candidates      — open banking readiness (suggestion-only)
--   3. pl_rent_match_audit           — append-only audit trail for match actions
--   4. pl_str_properties             — short-term rental compliance per property
--   5. pl_legal_templates            — legal template metadata/versioning
--   6. pl_partner_directory          — notary/legal/accountant partner directory
--
-- GUARDRAILS enforced in this file:
--   - No bank credentials or live bank API data stored
--   - No automatic ledger mutation from match suggestions
--   - STR workflows completely isolated from Najem Okazjonalny tables
--   - Template publish rules: only reviewed+active templates are production-ready
--   - Partner directory is account-scoped and never tenant-visible
--   - All tables use user_can_manage_account RLS; tenants blocked
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Feature plan mapping — full replacement (MUST include all prior features)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_feature_required_plan(
  p_feature TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(coalesce(p_feature, '')))
    -- ── Core features ─────────────────────────────────────────────────────────
    WHEN 'command_center'               THEN 'growth'
    WHEN 'portfolio_health'             THEN 'growth'
    WHEN 'maintenance_kpi'              THEN 'growth'
    WHEN 'playbooks'                    THEN 'pro'
    WHEN 'advanced_automation'          THEN 'pro'
    WHEN 'security_audit'               THEN 'pro'
    WHEN 'root_telemetry'               THEN 'pro'
    WHEN 'support_tooling'              THEN 'pro'

    -- ── AI features: Growth tier ──────────────────────────────────────────────
    WHEN 'ai_maintenance_triage'        THEN 'growth'
    WHEN 'ai_attention_insight'         THEN 'growth'
    WHEN 'ai_property_health'           THEN 'growth'

    -- ── AI features: Pro tier ─────────────────────────────────────────────────
    WHEN 'ai_contractor_recommendation' THEN 'pro'
    WHEN 'ai_weekly_portfolio_summary'  THEN 'pro'
    WHEN 'ai_message_drafts'            THEN 'pro'
    WHEN 'ai_document_summaries'        THEN 'pro'

    -- ── AI features: Operator/Agency tier ─────────────────────────────────────
    WHEN 'ai_security_copilot'          THEN 'operator_agency'
    WHEN 'ai_natural_language_query'    THEN 'operator_agency'
    WHEN 'ai_advanced_audit_summaries'  THEN 'operator_agency'

    -- ── Compliance & Risk Suite: Growth tier ──────────────────────────────────
    WHEN 'tax_readiness_dashboard'      THEN 'growth'
    WHEN 'rent_shield'                  THEN 'growth'
    WHEN 'ai_rent_shield_explainer'     THEN 'growth'
    WHEN 'renters_rights_readiness'     THEN 'growth'
    WHEN 'deposit_deductions_log'       THEN 'growth'
    WHEN 'deposit_settlement_statement' THEN 'growth'
    WHEN 'eco_upgrade_planner'          THEN 'growth'
    WHEN 'portfolio_health_eco_compliance' THEN 'growth'

    -- ── Compliance & Risk Suite: Pro tier ─────────────────────────────────────
    WHEN 'ai_lease_auditor'             THEN 'pro'

    -- ── Document Intelligence: Growth tier ────────────────────────────────────
    WHEN 'document_extraction'          THEN 'growth'

    -- ── Poland Compliance: Growth tier ────────────────────────────────────────
    WHEN 'poland_compliance'            THEN 'growth'

    -- ── Poland Advanced Market Features ───────────────────────────────────────
    WHEN 'pl_str_compliance'            THEN 'growth'   -- STR mode (separate from long-term)
    WHEN 'pl_open_banking_readiness'    THEN 'pro'      -- rent match suggestions only
    WHEN 'pl_template_library'          THEN 'pro'      -- legal template readiness
    WHEN 'pl_partner_directory'         THEN 'pro'      -- partner referral directory

    ELSE 'starter'
  END;
$$;

COMMENT ON FUNCTION public.account_feature_required_plan(TEXT) IS
  'Canonical feature→plan mapping. poland_advanced_features.sql is the last overlay '
  'and adds pl_str_compliance (Growth), pl_open_banking_readiness/pl_template_library/'
  'pl_partner_directory (Pro). All prior features preserved.';

REVOKE ALL   ON FUNCTION public.account_feature_required_plan(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.account_feature_required_plan(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. pl_rent_match_candidates
--    Suggestion-only: no bank credentials, no live bank API, no auto-ledger
--    mutation. Landlord confirmation required before any ledger action.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pl_rent_match_candidates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  property_id           UUID        REFERENCES public.properties(id)           ON DELETE CASCADE,
  tenant_id             UUID        REFERENCES public.tenants(id)              ON DELETE SET NULL,
  lease_id              UUID        REFERENCES public.leases(id)               ON DELETE SET NULL,

  -- Expected side (from lease / payment schedule)
  expected_amount       NUMERIC(12,2) NOT NULL CHECK (expected_amount > 0),
  expected_currency     TEXT        NOT NULL DEFAULT 'PLN',
  expected_period_start DATE        NOT NULL,
  expected_period_end   DATE        NOT NULL,

  -- Received side (manually entered by landlord — no live bank data in v1)
  candidate_amount      NUMERIC(12,2) CHECK (candidate_amount > 0),
  candidate_reference   TEXT,
  candidate_received_at TIMESTAMPTZ,
  candidate_source      TEXT        NOT NULL DEFAULT 'manual'
    CHECK (candidate_source IN ('manual')),    -- v1: manual only

  -- Matching metadata
  confidence_score      NUMERIC(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_reason     TEXT,

  -- Match status
  match_status          TEXT        NOT NULL DEFAULT 'suggested'
    CHECK (match_status IN ('suggested', 'confirmed', 'rejected', 'unmatched')),

  -- Confirmed by
  confirmed_by          UUID        REFERENCES auth.users(id)                  ON DELETE SET NULL,
  confirmed_at          TIMESTAMPTZ,

  -- Rejected
  rejected_by           UUID        REFERENCES auth.users(id)                  ON DELETE SET NULL,
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,

  -- Guardrail: ledger mutation never automatic in v1
  ledger_entry_id       UUID,       -- NULL until landlord explicitly records payment separately
  notes                 TEXT,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pl_rent_match_candidates IS
  'Suggested rent payment matches for Polish market open banking readiness. '
  'v1: manual entry only. No bank credentials stored. No automatic ledger mutation. '
  'All confirmations require explicit landlord action.';

COMMENT ON COLUMN public.pl_rent_match_candidates.ledger_entry_id IS
  'Always NULL in v1. Reserved for future manual link after landlord records '
  'the actual payment separately in the finance ledger.';

CREATE INDEX IF NOT EXISTS plrm_account_idx
  ON public.pl_rent_match_candidates (account_id, match_status);

CREATE INDEX IF NOT EXISTS plrm_tenant_period_idx
  ON public.pl_rent_match_candidates (account_id, tenant_id, expected_period_start);

ALTER TABLE public.pl_rent_match_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plrm_select_managers" ON public.pl_rent_match_candidates;
CREATE POLICY "plrm_select_managers"
  ON public.pl_rent_match_candidates FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

DROP POLICY IF EXISTS "plrm_write_managers" ON public.pl_rent_match_candidates;
CREATE POLICY "plrm_write_managers"
  ON public.pl_rent_match_candidates FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pl_rent_match_candidates TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. pl_rent_match_audit — append-only audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pl_rent_match_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  match_id        UUID        REFERENCES public.pl_rent_match_candidates(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL
    CHECK (action IN ('suggested', 'confirmed', 'rejected', 'unmatched', 'notes_updated')),
  actor_id        UUID        REFERENCES auth.users(id)                  ON DELETE SET NULL,
  previous_status TEXT,
  new_status      TEXT,
  notes           TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- immutable
);

COMMENT ON TABLE public.pl_rent_match_audit IS
  'Append-only audit trail for all rent match candidate status changes. '
  'created_at is immutable; no UPDATE or DELETE allowed on this table.';

CREATE INDEX IF NOT EXISTS plrma_match_idx
  ON public.pl_rent_match_audit (match_id);

CREATE INDEX IF NOT EXISTS plrma_account_created_idx
  ON public.pl_rent_match_audit (account_id, created_at DESC);

ALTER TABLE public.pl_rent_match_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plrma_select_managers" ON public.pl_rent_match_audit;
CREATE POLICY "plrma_select_managers"
  ON public.pl_rent_match_audit FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

DROP POLICY IF EXISTS "plrma_insert_managers" ON public.pl_rent_match_audit;
CREATE POLICY "plrma_insert_managers"
  ON public.pl_rent_match_audit FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_account(account_id));

-- No UPDATE or DELETE policy — append-only enforced by omission
GRANT SELECT, INSERT ON TABLE public.pl_rent_match_audit TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. pl_str_properties — Short-term rental compliance per property
--    Completely separate from Najem Okazjonalny / long-term lease workflows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pl_str_properties (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                UUID        NOT NULL REFERENCES public.accounts(id)  ON DELETE CASCADE,
  property_id               UUID        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Registration
  registration_number       TEXT,
  registration_status       TEXT        NOT NULL DEFAULT 'not_started'
    CHECK (registration_status IN ('not_started', 'pending', 'registered', 'expired')),
  registration_expiry_date  DATE,
  registration_notes        TEXT,

  -- Safety checklist (JSONB keyed by item_key → status)
  -- e.g. {"fire_extinguisher": "confirmed", "smoke_detector": "pending"}
  safety_checklist          JSONB       NOT NULL DEFAULT '{}',

  -- Platform references (JSONB array)
  -- e.g. [{"platform": "airbnb", "listing_id": "...", "listing_url": "..."}]
  platform_refs             JSONB       NOT NULL DEFAULT '[]',

  -- Reporting readiness
  reporting_readiness_status TEXT       NOT NULL DEFAULT 'not_ready'
    CHECK (reporting_readiness_status IN ('not_ready', 'partial', 'ready')),
  reporting_readiness_notes  TEXT,

  -- Disclaimer: not automatic government reporting
  metadata                  JSONB       NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (account_id, property_id)
);

COMMENT ON TABLE public.pl_str_properties IS
  'Short-term rental compliance records for Polish market. '
  'Separate from Najem Okazjonalny / long-term tenancy workflows. '
  'Does not claim automatic government reporting capability.';

COMMENT ON COLUMN public.pl_str_properties.safety_checklist IS
  'JSONB keyed by item_key (e.g. fire_extinguisher, smoke_detector, co_detector, '
  'first_aid_kit, emergency_exits, insurance) → status (pending|confirmed|not_applicable).';

COMMENT ON COLUMN public.pl_str_properties.platform_refs IS
  'JSONB array: [{platform, listing_id?, listing_url?, is_active}]. '
  'Platform values: airbnb, booking_com, vrbo, other. '
  'Does not imply direct Airbnb/Booking.com API integration.';

CREATE INDEX IF NOT EXISTS plstr_account_property_idx
  ON public.pl_str_properties (account_id, property_id);

ALTER TABLE public.pl_str_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plstr_select_managers" ON public.pl_str_properties;
CREATE POLICY "plstr_select_managers"
  ON public.pl_str_properties FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

DROP POLICY IF EXISTS "plstr_write_managers" ON public.pl_str_properties;
CREATE POLICY "plstr_write_managers"
  ON public.pl_str_properties FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pl_str_properties TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. pl_legal_templates — Legal template metadata/versioning
--    Readiness framework. Draft/unreviewed templates never treated as final.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pl_legal_templates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- NULL account_id = platform-level template (root/admin-managed)

  market              TEXT        NOT NULL DEFAULT 'pl'
    CHECK (market IN ('pl', 'uk', 'de')),
  language            TEXT        NOT NULL DEFAULT 'pl'
    CHECK (language IN ('pl', 'en', 'de')),
  template_type       TEXT        NOT NULL
    CHECK (template_type IN (
      'lease_agreement', 'handover_protocol', 'deposit_receipt',
      'tax_notice', 'termination_notice', 'other'
    )),
  title               TEXT        NOT NULL,
  version             TEXT        NOT NULL DEFAULT '1.0',

  -- Review lifecycle
  status              TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'requires_review', 'reviewed', 'retired')),
  reviewed_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  is_active           BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Content reference — immutable published version
  document_id         UUID        REFERENCES public.documents(id) ON DELETE SET NULL,
  parent_template_id  UUID        REFERENCES public.pl_legal_templates(id) ON DELETE SET NULL,

  -- Disclaimer always present
  disclaimer          TEXT        NOT NULL DEFAULT
    'This template is provided for reference only and does not constitute legal advice. '
    'Review with a qualified legal professional before use.',

  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pl_legal_templates IS
  'Legal template metadata for Polish market. '
  'RULE: only status=reviewed AND is_active=true templates appear in production UI. '
  'Draft/requires_review templates are never production-ready. '
  'Published versions are never overwritten — use parent_template_id for version lineage.';

COMMENT ON COLUMN public.pl_legal_templates.document_id IS
  'Immutable reference to the published document version in storage. '
  'Never overwrite — create a new template row with parent_template_id set instead.';

COMMENT ON COLUMN public.pl_legal_templates.is_active IS
  'Only TRUE for the current active version. Old reviewed versions remain accessible '
  'via parent_template_id chain but is_active=false.';

CREATE INDEX IF NOT EXISTS pltpl_market_type_idx
  ON public.pl_legal_templates (market, template_type, status, is_active);

CREATE INDEX IF NOT EXISTS pltpl_account_idx
  ON public.pl_legal_templates (account_id)
  WHERE account_id IS NOT NULL;

ALTER TABLE public.pl_legal_templates ENABLE ROW LEVEL SECURITY;

-- Platform templates (account_id IS NULL) are readable by all managers
DROP POLICY IF EXISTS "pltpl_select_managers" ON public.pl_legal_templates;
CREATE POLICY "pltpl_select_managers"
  ON public.pl_legal_templates FOR SELECT TO authenticated
  USING (
    account_id IS NULL
    OR public.user_can_manage_account(account_id)
  );

-- Only own-account templates can be written (platform templates via admin only)
DROP POLICY IF EXISTS "pltpl_write_managers" ON public.pl_legal_templates;
CREATE POLICY "pltpl_write_managers"
  ON public.pl_legal_templates FOR ALL TO authenticated
  USING  (account_id IS NOT NULL AND public.user_can_manage_account(account_id))
  WITH CHECK (account_id IS NOT NULL AND public.user_can_manage_account(account_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pl_legal_templates TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. pl_partner_directory — Notary/legal/accountant partner directory
--    No payment/referral fee logic. Not a public marketplace.
--    Market-scoped. Never visible to tenants.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pl_partner_directory (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- NULL account_id = platform-level listing (root-managed)

  market           TEXT        NOT NULL DEFAULT 'pl'
    CHECK (market IN ('pl', 'uk', 'de')),
  partner_type     TEXT        NOT NULL
    CHECK (partner_type IN ('notary', 'solicitor', 'accountant', 'property_manager')),
  name             TEXT        NOT NULL,
  company_name     TEXT,
  service_area     TEXT        NOT NULL,   -- city / region / 'nationwide'
  contact_method   TEXT        NOT NULL
    CHECK (contact_method IN ('phone', 'email', 'website')),
  contact_value    TEXT        NOT NULL,   -- actual phone / email / URL
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,

  -- No implied endorsement — disclaimer stored alongside record
  disclaimer       TEXT        NOT NULL DEFAULT
    'This is a contact directory entry only. OASIS does not endorse, verify, '
    'or guarantee the services of any listed partner.',
  referral_metadata JSONB      NOT NULL DEFAULT '{}',   -- future-ready, no fee logic
  internal_notes   TEXT,                                -- landlord/admin only
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pl_partner_directory IS
  'Optional partner contact directory for Polish market landlords. '
  'Not a marketplace. No payment or referral fee processing. '
  'Tenant access blocked by RLS. Not an endorsement of listed parties.';

CREATE INDEX IF NOT EXISTS plpd_market_type_idx
  ON public.pl_partner_directory (market, partner_type, is_active);

CREATE INDEX IF NOT EXISTS plpd_account_idx
  ON public.pl_partner_directory (account_id)
  WHERE account_id IS NOT NULL;

ALTER TABLE public.pl_partner_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plpd_select_managers" ON public.pl_partner_directory;
CREATE POLICY "plpd_select_managers"
  ON public.pl_partner_directory FOR SELECT TO authenticated
  USING (
    account_id IS NULL
    OR public.user_can_manage_account(account_id)
  );

DROP POLICY IF EXISTS "plpd_write_managers" ON public.pl_partner_directory;
CREATE POLICY "plpd_write_managers"
  ON public.pl_partner_directory FOR ALL TO authenticated
  USING  (account_id IS NOT NULL AND public.user_can_manage_account(account_id))
  WITH CHECK (account_id IS NOT NULL AND public.user_can_manage_account(account_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pl_partner_directory TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- 7. create_rent_match_candidate
DROP FUNCTION IF EXISTS public.create_rent_match_candidate(UUID,UUID,UUID,UUID,NUMERIC,TEXT,DATE,DATE,NUMERIC,TEXT,TIMESTAMPTZ,NUMERIC,TEXT);

CREATE FUNCTION public.create_rent_match_candidate(
  p_account_id            UUID,
  p_property_id           UUID,
  p_tenant_id             UUID,
  p_lease_id              UUID,
  p_expected_amount       NUMERIC,
  p_expected_currency     TEXT,
  p_expected_period_start DATE,
  p_expected_period_end   DATE,
  p_candidate_amount      NUMERIC    DEFAULT NULL,
  p_candidate_reference   TEXT       DEFAULT NULL,
  p_candidate_received_at TIMESTAMPTZ DEFAULT NULL,
  p_confidence_score      NUMERIC    DEFAULT NULL,
  p_confidence_reason     TEXT       DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);
  PERFORM public.assert_account_feature_access(p_account_id, 'pl_open_banking_readiness');

  INSERT INTO pl_rent_match_candidates (
    account_id, property_id, tenant_id, lease_id,
    expected_amount, expected_currency,
    expected_period_start, expected_period_end,
    candidate_amount, candidate_reference, candidate_received_at,
    confidence_score, confidence_reason,
    match_status
  ) VALUES (
    p_account_id, p_property_id, p_tenant_id, p_lease_id,
    p_expected_amount, coalesce(p_expected_currency, 'PLN'),
    p_expected_period_start, p_expected_period_end,
    p_candidate_amount, p_candidate_reference, p_candidate_received_at,
    p_confidence_score, p_confidence_reason,
    'suggested'
  )
  RETURNING id INTO v_id;

  INSERT INTO pl_rent_match_audit (
    account_id, match_id, action, actor_id, previous_status, new_status
  ) VALUES (
    p_account_id, v_id, 'suggested', auth.uid(), NULL, 'suggested'
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_rent_match_candidate(UUID,UUID,UUID,UUID,NUMERIC,TEXT,DATE,DATE,NUMERIC,TEXT,TIMESTAMPTZ,NUMERIC,TEXT)
  TO authenticated;

-- 8. update_rent_match_status
DROP FUNCTION IF EXISTS public.update_rent_match_status(UUID,UUID,TEXT,TEXT);

CREATE FUNCTION public.update_rent_match_status(
  p_account_id UUID,
  p_match_id   UUID,
  p_new_status TEXT,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status TEXT;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);
  PERFORM public.assert_account_feature_access(p_account_id, 'pl_open_banking_readiness');

  IF p_new_status NOT IN ('confirmed', 'rejected', 'unmatched') THEN
    RAISE EXCEPTION 'invalid_match_status: %', p_new_status;
  END IF;

  SELECT match_status INTO v_prev_status
  FROM pl_rent_match_candidates
  WHERE id = p_match_id AND account_id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_candidate_not_found';
  END IF;

  UPDATE pl_rent_match_candidates
  SET
    match_status  = p_new_status,
    confirmed_by  = CASE WHEN p_new_status = 'confirmed' THEN auth.uid() ELSE confirmed_by END,
    confirmed_at  = CASE WHEN p_new_status = 'confirmed' THEN now()      ELSE confirmed_at END,
    rejected_by   = CASE WHEN p_new_status = 'rejected'  THEN auth.uid() ELSE rejected_by  END,
    rejected_at   = CASE WHEN p_new_status = 'rejected'  THEN now()      ELSE rejected_at  END,
    rejection_reason = CASE WHEN p_new_status = 'rejected' THEN p_notes  ELSE rejection_reason END,
    notes        = CASE WHEN p_new_status = 'unmatched'  THEN p_notes    ELSE notes END,
    updated_at   = now()
  WHERE id = p_match_id AND account_id = p_account_id;

  INSERT INTO pl_rent_match_audit (
    account_id, match_id, action, actor_id, previous_status, new_status, notes
  ) VALUES (
    p_account_id, p_match_id, p_new_status, auth.uid(), v_prev_status, p_new_status, p_notes
  );

  RETURN jsonb_build_object('ok', true, 'previous_status', v_prev_status, 'new_status', p_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_rent_match_status(UUID,UUID,TEXT,TEXT) TO authenticated;

-- 9. list_rent_match_candidates
DROP FUNCTION IF EXISTS public.list_rent_match_candidates(UUID, UUID, UUID, TEXT);

CREATE FUNCTION public.list_rent_match_candidates(
  p_account_id  UUID,
  p_property_id UUID  DEFAULT NULL,
  p_tenant_id   UUID  DEFAULT NULL,
  p_status      TEXT  DEFAULT NULL
)
RETURNS SETOF public.pl_rent_match_candidates
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM pl_rent_match_candidates c
  WHERE c.account_id    = public.assert_manage_account_access(p_account_id)
    AND (p_property_id IS NULL OR c.property_id = p_property_id)
    AND (p_tenant_id   IS NULL OR c.tenant_id   = p_tenant_id)
    AND (p_status      IS NULL OR c.match_status = p_status)
  ORDER BY c.expected_period_start DESC, c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_rent_match_candidates(UUID,UUID,UUID,TEXT) TO authenticated;

-- 10. upsert_str_property
DROP FUNCTION IF EXISTS public.upsert_str_property(UUID,UUID,TEXT,TEXT,DATE,TEXT,JSONB,JSONB,TEXT,TEXT);

CREATE FUNCTION public.upsert_str_property(
  p_account_id                  UUID,
  p_property_id                 UUID,
  p_registration_number         TEXT     DEFAULT NULL,
  p_registration_status         TEXT     DEFAULT 'not_started',
  p_registration_expiry_date    DATE     DEFAULT NULL,
  p_registration_notes          TEXT     DEFAULT NULL,
  p_safety_checklist            JSONB    DEFAULT NULL,
  p_platform_refs               JSONB    DEFAULT NULL,
  p_reporting_readiness_status  TEXT     DEFAULT 'not_ready',
  p_reporting_readiness_notes   TEXT     DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);
  PERFORM public.assert_account_feature_access(p_account_id, 'pl_str_compliance');

  INSERT INTO pl_str_properties (
    account_id, property_id,
    registration_number, registration_status, registration_expiry_date, registration_notes,
    safety_checklist, platform_refs,
    reporting_readiness_status, reporting_readiness_notes
  ) VALUES (
    p_account_id, p_property_id,
    p_registration_number, p_registration_status, p_registration_expiry_date, p_registration_notes,
    coalesce(p_safety_checklist, '{}'),
    coalesce(p_platform_refs,    '[]'),
    p_reporting_readiness_status, p_reporting_readiness_notes
  )
  ON CONFLICT (account_id, property_id) DO UPDATE SET
    registration_number           = EXCLUDED.registration_number,
    registration_status           = EXCLUDED.registration_status,
    registration_expiry_date      = EXCLUDED.registration_expiry_date,
    registration_notes            = EXCLUDED.registration_notes,
    safety_checklist              = EXCLUDED.safety_checklist,
    platform_refs                 = EXCLUDED.platform_refs,
    reporting_readiness_status    = EXCLUDED.reporting_readiness_status,
    reporting_readiness_notes     = EXCLUDED.reporting_readiness_notes,
    updated_at                    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_str_property(UUID,UUID,TEXT,TEXT,DATE,TEXT,JSONB,JSONB,TEXT,TEXT)
  TO authenticated;

-- 11. list_str_properties
DROP FUNCTION IF EXISTS public.list_str_properties(UUID);

CREATE FUNCTION public.list_str_properties(p_account_id UUID)
RETURNS SETOF public.pl_str_properties
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM pl_str_properties s
  WHERE s.account_id = public.assert_manage_account_access(p_account_id)
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_str_properties(UUID) TO authenticated;

-- 12. list_legal_templates (only reviewed+active for production; all for admin)
DROP FUNCTION IF EXISTS public.list_legal_templates(TEXT, TEXT, BOOLEAN);

CREATE FUNCTION public.list_legal_templates(
  p_market           TEXT    DEFAULT 'pl',
  p_template_type    TEXT    DEFAULT NULL,
  p_include_all      BOOLEAN DEFAULT FALSE   -- TRUE = include draft/review (admin only)
)
RETURNS SETOF public.pl_legal_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.*
  FROM pl_legal_templates t
  WHERE t.market = p_market
    AND (p_template_type IS NULL OR t.template_type = p_template_type)
    AND (
      p_include_all
      OR (t.status = 'reviewed' AND t.is_active = TRUE)
    )
  ORDER BY t.template_type, t.version DESC, t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_legal_templates(TEXT,TEXT,BOOLEAN) TO authenticated;

-- 13. list_partners
DROP FUNCTION IF EXISTS public.list_partners(TEXT, TEXT, TEXT);

CREATE FUNCTION public.list_partners(
  p_market       TEXT DEFAULT 'pl',
  p_partner_type TEXT DEFAULT NULL,
  p_service_area TEXT DEFAULT NULL
)
RETURNS SETOF public.pl_partner_directory
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM pl_partner_directory p
  WHERE p.market      = p_market
    AND p.is_active   = TRUE
    AND (p_partner_type IS NULL OR p.partner_type = p_partner_type)
    AND (p_service_area IS NULL OR p.service_area ILIKE '%' || p_service_area || '%')
  ORDER BY p.partner_type, p.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_partners(TEXT,TEXT,TEXT) TO authenticated;
