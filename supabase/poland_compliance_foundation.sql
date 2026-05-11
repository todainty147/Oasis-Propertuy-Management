-- =============================================================================
-- Poland Compliance Foundation
-- =============================================================================
-- Scope:
--   • accounts.default_market, properties.market, leases.lease_type columns
--   • compliance_checklist_items table with RLS
--   • setup_najem_okazjonalny_checklist RPC (idempotent)
--   • update_checklist_item_evidence RPC (validates same-account document)
--   • notify_pl_compliance_deadlines RPC
--   • pl_compliance_checklist_command_items helper function
--
-- Guardrails:
--   • All tables use user_can_manage_account RLS (tenants and contractors excluded)
--   • Evidence document cross-account linking denied via RPC validation
--   • No legal guarantee language — tool "helps track", not "guarantees"
--   • Polish compliance is opt-in per property/tenant — not all PL tenancies
--     are Najem Okazjonalny
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Market columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS default_market TEXT
    CHECK (default_market IS NULL OR default_market IN ('pl', 'uk', 'generic'));

COMMENT ON COLUMN public.accounts.default_market IS
  'Optional compliance market override for this account. NULL = derived from country_code by frontend.';

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS market TEXT
    CHECK (market IS NULL OR market IN ('pl', 'uk', 'generic'));

COMMENT ON COLUMN public.properties.market IS
  'Property-level compliance market override: pl, uk, generic. NULL inherits from account default.';

-- ---------------------------------------------------------------------------
-- 2. Lease type column
-- ---------------------------------------------------------------------------

ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS lease_type TEXT
    CHECK (lease_type IS NULL OR lease_type IN ('standard', 'najem_okazjonalny', 'other'));

COMMENT ON COLUMN public.leases.lease_type IS
  'Type of tenancy agreement. najem_okazjonalny = Polish occasional lease per Art. 19a ustawy o ochronie praw lokatorów.';

-- ---------------------------------------------------------------------------
-- 3. compliance_checklist_items table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.compliance_checklist_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  property_id          UUID        REFERENCES public.properties(id)           ON DELETE CASCADE,
  tenant_id            UUID        REFERENCES public.tenants(id)              ON DELETE SET NULL,
  lease_id             UUID        REFERENCES public.leases(id)               ON DELETE SET NULL,
  market               TEXT        NOT NULL DEFAULT 'generic'
    CHECK (market IN ('pl', 'uk', 'generic')),
  checklist_type       TEXT        NOT NULL,
  item_key             TEXT        NOT NULL,
  title                TEXT        NOT NULL,
  description          TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'complete', 'not_applicable', 'overdue')),
  due_date             DATE,
  completed_at         TIMESTAMPTZ,
  completed_by         UUID        REFERENCES auth.users(id)                  ON DELETE SET NULL,
  evidence_document_id UUID        REFERENCES public.documents(id)            ON DELETE SET NULL,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.compliance_checklist_items IS
  'Market-specific compliance checklists (e.g. Najem Okazjonalny for Polish tenancies). '
  'This tool helps track formal requirements. It does not constitute legal advice.';

-- Idempotency: one item per (account, property, tenant, type, key) when tenant is set
CREATE UNIQUE INDEX IF NOT EXISTS cci_uq_with_tenant
  ON public.compliance_checklist_items (account_id, property_id, tenant_id, checklist_type, item_key)
  WHERE property_id IS NOT NULL AND tenant_id IS NOT NULL;

-- Idempotency: one item per (account, property, type, key) when no tenant
CREATE UNIQUE INDEX IF NOT EXISTS cci_uq_no_tenant
  ON public.compliance_checklist_items (account_id, property_id, checklist_type, item_key)
  WHERE property_id IS NOT NULL AND tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS cci_account_market_idx
  ON public.compliance_checklist_items (account_id, market, checklist_type, status);

CREATE INDEX IF NOT EXISTS cci_due_date_idx
  ON public.compliance_checklist_items (account_id, due_date)
  WHERE due_date IS NOT NULL AND status = 'pending';

-- RLS
ALTER TABLE public.compliance_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cci_select_managers" ON public.compliance_checklist_items;
CREATE POLICY "cci_select_managers"
  ON public.compliance_checklist_items
  FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

DROP POLICY IF EXISTS "cci_write_managers" ON public.compliance_checklist_items;
CREATE POLICY "cci_write_managers"
  ON public.compliance_checklist_items
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

-- ---------------------------------------------------------------------------
-- 4. setup_najem_okazjonalny_checklist RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.setup_najem_okazjonalny_checklist(
  p_account_id  UUID,
  p_property_id UUID,
  p_tenant_id   UUID,
  p_lease_id    UUID  DEFAULT NULL,
  p_lease_start DATE  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_date   DATE;
  v_created    INTEGER := 0;
  v_skipped    INTEGER := 0;
  v_item       JSONB;
  v_item_key   TEXT;
  v_item_title TEXT;
  v_has_dl     BOOLEAN;
  v_items      JSONB := '[
    {"key":"lease_agreement",        "title":"Umowa najmu okazjonalnego",                          "has_deadline":false},
    {"key":"notarial_declaration",   "title":"Oświadczenie notarialne najemcy",                    "has_deadline":false},
    {"key":"alternative_address_decl","title":"Oświadczenie o adresie zastępczym najemcy",         "has_deadline":false},
    {"key":"owner_consent",          "title":"Zgoda właściciela nieruchomości zastępczej",         "has_deadline":false},
    {"key":"tax_office_notification","title":"Zgłoszenie do urzędu skarbowego",                    "has_deadline":true},
    {"key":"tax_office_deadline",    "title":"Termin zgłoszenia do US (14 dni od zawarcia umowy)", "has_deadline":true},
    {"key":"tax_office_proof",       "title":"Dowód złożenia zgłoszenia do urzędu skarbowego",     "has_deadline":false},
    {"key":"handover_protocol",      "title":"Protokół zdawczo-odbiorczy",                         "has_deadline":false},
    {"key":"deposit_confirmation",   "title":"Potwierdzenie wpłaty kaucji",                        "has_deadline":false},
    {"key":"meter_readings",         "title":"Odczyty liczników",                                  "has_deadline":false}
  ]'::jsonb;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  -- Advisory lock: serialise concurrent setup for same property/tenant scope
  PERFORM pg_advisory_xact_lock(
    hashtext('najem_okazjonalny:' || p_property_id::text || ':' || coalesce(p_tenant_id::text, 'no_tenant'))
  );

  -- Tax Office deadline = lease_start + 14 days (when known)
  IF p_lease_start IS NOT NULL THEN
    v_due_date := p_lease_start + 14;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_item_key   := v_item->>'key';
    v_item_title := v_item->>'title';
    v_has_dl     := (v_item->>'has_deadline')::boolean;

    -- Idempotency check — skip if already exists
    IF EXISTS (
      SELECT 1 FROM compliance_checklist_items
      WHERE account_id     = p_account_id
        AND property_id    = p_property_id
        AND (tenant_id = p_tenant_id OR (tenant_id IS NULL AND p_tenant_id IS NULL))
        AND checklist_type = 'najem_okazjonalny'
        AND item_key       = v_item_key
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO compliance_checklist_items (
      account_id, property_id, tenant_id, lease_id,
      market, checklist_type, item_key, title,
      due_date, metadata
    ) VALUES (
      p_account_id, p_property_id, p_tenant_id, p_lease_id,
      'pl', 'najem_okazjonalny', v_item_key, v_item_title,
      CASE WHEN v_has_dl THEN v_due_date ELSE NULL END,
      '{}'
    );

    v_created := v_created + 1;
  END LOOP;

  -- Mark the lease as najem_okazjonalny when lease_id is provided
  IF p_lease_id IS NOT NULL THEN
    UPDATE leases
    SET lease_type = 'najem_okazjonalny',
        updated_at = now()
    WHERE id = p_lease_id AND account_id = p_account_id;
  END IF;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'total', v_created + v_skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_najem_okazjonalny_checklist(UUID, UUID, UUID, UUID, DATE)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. update_checklist_item_evidence RPC
--    Validates that the linked document belongs to the same account.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_checklist_item_evidence(
  p_account_id    UUID,
  p_item_id       UUID,
  p_document_id   UUID,
  p_mark_complete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_account UUID;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  -- Cross-account document linking guard
  SELECT account_id INTO v_doc_account
  FROM public.documents
  WHERE id = p_document_id;

  IF v_doc_account IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'document_not_found_or_cross_account';
  END IF;

  UPDATE compliance_checklist_items
  SET
    evidence_document_id = p_document_id,
    status = CASE
      WHEN p_mark_complete THEN 'complete'
      ELSE status
    END,
    completed_at = CASE
      WHEN p_mark_complete AND completed_at IS NULL THEN now()
      ELSE completed_at
    END,
    completed_by = CASE
      WHEN p_mark_complete AND completed_by IS NULL THEN auth.uid()
      ELSE completed_by
    END,
    updated_at = now()
  WHERE id = p_item_id AND account_id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_item_not_found';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_checklist_item_evidence(UUID, UUID, UUID, BOOLEAN)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. notify_pl_compliance_deadlines RPC
--    Generates notifications for upcoming/overdue Tax Office deadlines.
--    Call this from a cron job or manually — avoids duplicate same-day alerts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_pl_compliance_deadlines(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item         RECORD;
  v_recipients   UUID[];
  v_notified     INTEGER := 0;
  v_last_notified DATE;
  v_threshold    INTEGER;
  v_title        TEXT;
  v_body         TEXT;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  -- Owner and admin members receive compliance notifications
  SELECT ARRAY(
    SELECT am.user_id
    FROM   account_members am
    WHERE  am.account_id  = p_account_id
      AND  am.role IN ('owner', 'admin')
      AND  am.archived_at IS NULL
  ) INTO v_recipients;

  IF array_length(v_recipients, 1) IS NULL THEN
    RETURN jsonb_build_object('notified', 0, 'reason', 'no_recipients');
  END IF;

  -- Process pending Tax Office deadline items due within 7 days (or overdue)
  FOR v_item IN
    SELECT ci.id, ci.due_date, ci.title, ci.metadata,
           coalesce(p.address, '—') AS property_label
    FROM   compliance_checklist_items ci
    LEFT JOIN properties p ON p.id = ci.property_id
    WHERE  ci.account_id      = p_account_id
      AND  ci.market          = 'pl'
      AND  ci.checklist_type  = 'najem_okazjonalny'
      AND  ci.item_key        = 'tax_office_deadline'
      AND  ci.status          = 'pending'
      AND  ci.due_date        IS NOT NULL
      AND  ci.due_date        <= current_date + 7
  LOOP
    -- Skip if already notified today (metadata.last_notified stores ISO date string)
    v_last_notified := (v_item.metadata->>'last_notified')::date;
    CONTINUE WHEN v_last_notified IS NOT DISTINCT FROM current_date;

    v_threshold := (v_item.due_date - current_date)::integer;

    IF v_threshold < 0 THEN
      v_title := 'Termin zgłoszenia do US — zaległe';
      v_body  := 'Najem okazjonalny: ' || v_item.property_label || ' — termin minął ' || abs(v_threshold) || ' dni temu.';
    ELSIF v_threshold = 0 THEN
      v_title := 'Termin zgłoszenia do US — dzisiaj';
      v_body  := 'Najem okazjonalny: ' || v_item.property_label || ' — termin mija dzisiaj.';
    ELSIF v_threshold = 1 THEN
      v_title := 'Termin zgłoszenia do US — jutro';
      v_body  := 'Najem okazjonalny: ' || v_item.property_label || ' — termin mija jutro.';
    ELSE
      v_title := 'Termin zgłoszenia do US — za ' || v_threshold || ' dni';
      v_body  := 'Najem okazjonalny: ' || v_item.property_label;
    END IF;

    PERFORM public.create_notifications(
      p_account_id,
      v_recipients,
      'compliance_due',
      v_title,
      v_body,
      'compliance_checklist_item',
      v_item.id,
      '/compliance/poland',
      jsonb_build_object(
        'checklist_type', 'najem_okazjonalny',
        'item_key',       'tax_office_deadline',
        'pl_reminder',    true,
        'due_days',       v_threshold
      )
    );

    -- Record today so we don't re-notify the same day
    UPDATE compliance_checklist_items
    SET metadata   = metadata || jsonb_build_object('last_notified', current_date::text),
        updated_at = now()
    WHERE id = v_item.id;

    v_notified := v_notified + 1;
  END LOOP;

  RETURN jsonb_build_object('notified', v_notified);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_pl_compliance_deadlines(UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. pl_compliance_checklist_command_items helper function
--    Returns PL-specific command center items in the same shape as
--    command_center_items rows. Called by commandCenterService.js alongside
--    the main RPC — results are merged and sorted client-side.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.pl_compliance_checklist_command_items(UUID, INTEGER);

CREATE FUNCTION public.pl_compliance_checklist_command_items(
  p_account_id UUID,
  p_limit      INTEGER DEFAULT 40
)
RETURNS TABLE (
  item_key        text,
  item_type       text,
  category        text,
  severity        text,
  bucket          text,
  entity_type     text,
  entity_id       text,
  title           text,
  body            text,
  link_path       text,
  property_id     uuid,
  property_label  text,
  tenant_id       uuid,
  tenant_label    text,
  entity_label    text,
  contractor_label text,
  amount          numeric,
  age_hours       integer,
  due_days        integer,
  created_at      timestamptz,
  resolved_state  boolean,
  source_table    text,
  sort_order      integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.assert_manage_account_access(p_account_id) AS account_id
  ),
  pl_items AS (

    -- Missing notarial declaration
    -- Column aliases on first UNION ALL branch so ORDER BY can reference by name.
    SELECT
      'pl-notarial-' || ci.id::text         AS item_key,
      'pl_missing_notarial_declaration'      AS item_type,
      'compliance'                           AS category,
      'action'                               AS severity,
      'action'                               AS bucket,
      'tenant'                               AS entity_type,
      ci.tenant_id::text                     AS entity_id,
      'Brak oświadczenia notarialnego'       AS title,
      ''                                     AS body,
      '/compliance/poland'                   AS link_path,
      ci.property_id                         AS property_id,
      coalesce(p.address, '—')               AS property_label,
      ci.tenant_id                           AS tenant_id,
      coalesce(t.name, '—')                  AS tenant_label,
      ci.title                               AS entity_label,
      ''                                     AS contractor_label,
      null::numeric                          AS amount,
      null::int                              AS age_hours,
      null::int                              AS due_days,
      ci.created_at                          AS created_at,
      false                                  AS resolved_state,
      'compliance_checklist_items'           AS source_table,
      19                                     AS sort_order
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'notarial_declaration'
      AND ci.status        = 'pending'

    UNION ALL

    -- Missing alternative address declaration
    SELECT
      'pl-alt-addr-' || ci.id::text,
      'pl_missing_alt_address_declaration',
      'compliance', 'action', 'action',
      'tenant', ci.tenant_id::text,
      'Brak oświadczenia o adresie zastępczym',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int, null::int,
      ci.created_at, false, 'compliance_checklist_items', 19
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'alternative_address_decl'
      AND ci.status        = 'pending'

    UNION ALL

    -- Tax office deadline overdue (urgent)
    SELECT
      'pl-tax-overdue-' || ci.id::text,
      'pl_tax_office_deadline_overdue',
      'compliance', 'urgent', 'urgent',
      'property', ci.property_id::text,
      'Termin zgłoszenia do US — zaległe',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int,
      (ci.due_date - current_date)::int,
      ci.updated_at, false, 'compliance_checklist_items', 12
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'tax_office_deadline'
      AND ci.status        = 'pending'
      AND ci.due_date      < current_date

    UNION ALL

    -- Tax office deadline due within 1 day (urgent)
    SELECT
      'pl-tax-due-1-' || ci.id::text,
      'pl_tax_office_deadline_due_soon',
      'compliance', 'urgent', 'urgent',
      'property', ci.property_id::text,
      'Termin zgłoszenia do US — jutro lub dzisiaj',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int,
      (ci.due_date - current_date)::int,
      ci.updated_at, false, 'compliance_checklist_items', 13
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'tax_office_deadline'
      AND ci.status        = 'pending'
      AND ci.due_date      >= current_date
      AND ci.due_date      <= current_date + 1

    UNION ALL

    -- Tax office deadline due within 7 days (action)
    SELECT
      'pl-tax-due-' || ci.id::text,
      'pl_tax_office_deadline_due_soon',
      'compliance', 'action', 'action',
      'property', ci.property_id::text,
      'Termin zgłoszenia do US wkrótce',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int,
      (ci.due_date - current_date)::int,
      ci.updated_at, false, 'compliance_checklist_items', 25
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'tax_office_deadline'
      AND ci.status        = 'pending'
      AND ci.due_date      > current_date + 1
      AND ci.due_date      <= current_date + 7

    UNION ALL

    -- Missing tax office proof
    SELECT
      'pl-tax-proof-' || ci.id::text,
      'pl_missing_tax_office_proof',
      'compliance', 'action', 'action',
      'property', ci.property_id::text,
      'Brak dowodu zgłoszenia do urzędu skarbowego',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int, null::int,
      ci.created_at, false, 'compliance_checklist_items', 26
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'tax_office_proof'
      AND ci.status        = 'pending'

    UNION ALL

    -- Missing handover protocol
    SELECT
      'pl-handover-' || ci.id::text,
      'pl_missing_handover_protocol',
      'compliance', 'action', 'action',
      'property', ci.property_id::text,
      'Brak protokołu zdawczo-odbiorczego',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int, null::int,
      ci.created_at, false, 'compliance_checklist_items', 30
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'handover_protocol'
      AND ci.status        = 'pending'

    UNION ALL

    -- Missing deposit confirmation
    SELECT
      'pl-deposit-' || ci.id::text,
      'pl_missing_deposit_confirmation',
      'compliance', 'action', 'action',
      'property', ci.property_id::text,
      'Brak potwierdzenia wpłaty kaucji',
      '',
      '/compliance/poland',
      ci.property_id, coalesce(p.address, '—'),
      ci.tenant_id,   coalesce(t.name, '—'),
      ci.title, '', null::numeric, null::int, null::int,
      ci.created_at, false, 'compliance_checklist_items', 35
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN properties p ON p.id = ci.property_id
    LEFT JOIN tenants    t ON t.id = ci.tenant_id
    WHERE ci.account_id    = a.account_id
      AND ci.market        = 'pl'
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.item_key      = 'deposit_confirmation'
      AND ci.status        = 'pending'

  )
  SELECT * FROM pl_items
  ORDER BY
    CASE bucket WHEN 'urgent' THEN 1 WHEN 'action' THEN 2 ELSE 3 END,
    sort_order,
    coalesce(due_days, 999999),
    item_key
  LIMIT greatest(1, least(coalesce(p_limit, 40), 200));
$$;

GRANT EXECUTE ON FUNCTION public.pl_compliance_checklist_command_items(UUID, INTEGER)
  TO authenticated;
