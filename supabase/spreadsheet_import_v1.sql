-- =============================================================================
-- Spreadsheet Import v1 — P-009
-- =============================================================================
-- Scope: conservative, audit-driven landlord spreadsheet import for Properties,
--   Tenancies, Compliance, and Maintenance. One reusable account-scoped module.
--
-- Safety spine:
--   No fuzzy matching. No silent overwrites. No hidden property creation from
--   child rows. Exact/normalised matching only. Row-level partial commit.
--   Every imported entity carries an attested-import provenance record.
--
-- Provenance honesty (D4/RB-02):
--   Imported events are ATTESTED IMPORT CUSTODY, not native event provenance.
--   actor_type='integration'; occurred_at=import execution time;
--   original spreadsheet dates go in metadata ONLY, never in occurred_at.
-- =============================================================================

-- ─── §1  properties.external_property_ref column + index ─────────────────────
--
-- Nullable text. Account-scoped. Partial unique index enforces no duplicates
-- within an account, but the column itself is nullable (many existing properties
-- won't have a ref). Never auto-generated; never fuzzy; never silently overwritten.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS external_property_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS properties_account_external_ref_uidx
  ON public.properties (account_id, external_property_ref)
  WHERE external_property_ref IS NOT NULL AND btrim(external_property_ref) <> '';

COMMENT ON COLUMN public.properties.external_property_ref IS
  'Landlord-supplied external reference from a prior PMS or spreadsheet. '
  'Tier-1 match key for spreadsheet import (exact, account-scoped). '
  'Never fuzzy-matched; never auto-generated; never silently overwritten.';

-- ─── §2  import_batches ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_batches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_filename TEXT        NOT NULL,
  source_file_hash TEXT,
  tab             TEXT        NOT NULL,
  triggered_by    UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'processing',
  total_rows      INTEGER     NOT NULL DEFAULT 0,
  imported_rows   INTEGER     NOT NULL DEFAULT 0,
  skipped_rows    INTEGER     NOT NULL DEFAULT 0,
  review_rows     INTEGER     NOT NULL DEFAULT 0,
  error_rows      INTEGER     NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_batches_status_check
    CHECK (status IN ('processing', 'complete', 'partial', 'failed')),
  CONSTRAINT import_batches_tab_check
    CHECK (tab IN ('properties', 'tenancies', 'compliance', 'maintenance'))
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_batches_account_member ON public.import_batches;
CREATE POLICY import_batches_account_member ON public.import_batches
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_import_batches_account_created
  ON public.import_batches (account_id, created_at DESC);

-- ─── §3  import_batch_rows ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_batch_rows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  batch_id      UUID        NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  tab           TEXT        NOT NULL,
  row_number    INTEGER     NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  entity_type   TEXT,
  entity_id     UUID,
  raw_row       JSONB       NOT NULL DEFAULT '{}',
  mapped_row    JSONB       NOT NULL DEFAULT '{}',
  review_reason TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_batch_rows_status_check
    CHECK (status IN ('imported', 'skipped', 'needs_review', 'error'))
);

ALTER TABLE public.import_batch_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_batch_rows_account_member ON public.import_batch_rows;
CREATE POLICY import_batch_rows_account_member ON public.import_batch_rows
  FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch
  ON public.import_batch_rows (batch_id, row_number);

-- ─── §4  how_to_rent requirement seed (idempotent, absent-only) ──────────────
--
-- Seeds the how_to_rent requirement key into the UK/England template.
-- ON CONFLICT DO NOTHING — does not touch existing rows, does not redesign
-- the compliance engine. Safe to replay.

INSERT INTO public.compliance_requirements (
  template_id, requirement_key, label, description,
  requirement_type, expiry_tracking, acknowledgement_required, sort_order
)
SELECT
  t.id,
  'how_to_rent',
  'How to Rent guide',
  'Record of How to Rent guide service to tenant. Attested import custody only — not native served evidence.',
  'document',
  false,
  true,
  120
FROM public.compliance_templates t
WHERE t.country_code = 'GB'
  AND t.jurisdiction = 'england'
  AND t.template_key = 'uk_england_tenancy_security'
ON CONFLICT (template_id, requirement_key) DO NOTHING;

-- ─── §5  record_import_provenance_event wrapper RPC ──────────────────────────
--
-- Public entry point for attested-import provenance events.
-- Wraps _append_evidence_provenance_event (no grants; internal only).
-- actor_type is hardcoded to 'integration' — never 'human'.
-- occurred_at is hardcoded to NOW() — import execution time only.
-- Triggering user ID stored in metadata.triggered_by_user_id.
-- Cross-account deny: user_can_manage_account gate enforced before delegate.
-- Anon deny: auth.uid() IS NULL check at entry.
--
-- D4/RB-02 honesty constraints:
--   summary MUST NOT contain "system-observed", "verified", "native evidence chain",
--   "cryptographically proven", or claim the event is anything other than an import.
--   Callers are responsible for constructing honest summaries.

DROP FUNCTION IF EXISTS public.record_import_provenance_event(
  uuid, text, uuid, text, text, uuid, jsonb, text
);

CREATE OR REPLACE FUNCTION public.record_import_provenance_event(
  p_account_id     UUID,
  p_entity_type    TEXT,
  p_entity_id      UUID,
  p_event_type     TEXT,
  p_summary        TEXT,
  p_source_id      UUID,
  p_metadata       JSONB    DEFAULT '{}',
  p_idempotency_key TEXT   DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- T-INTEGRITY-2: word-boundary forbidden terms.
  -- Compound phrases (multi-word) match as substrings.
  -- Single-word terms use word-boundary regex (\m...\M) to avoid false positives
  -- on "observed"/"prescribed"/"unverified"/"disproven" etc.
  -- Sanctioned phrase "not a Tenaqo-observed event" is whitelisted before checking.
  v_term TEXT;
  v_scrubbed TEXT;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING errcode = '28000';
  END IF;

  -- Account boundary (cross-account deny)
  IF NOT public.user_can_manage_account(p_account_id) THEN
    RAISE EXCEPTION 'Access denied to account'
      USING errcode = '42501';
  END IF;

  -- Honesty guard — T-INTEGRITY-2
  -- Step 1: whitelist sanctioned phrases so they don't trigger false positives
  v_scrubbed := regexp_replace(
    lower(coalesce(p_summary, '')),
    'not a tenaqo-observed event',
    '__whitelisted__',
    'gi'
  );

  -- Step 2: single-word forbidden terms (word-boundary match)
  FOREACH v_term IN ARRAY ARRAY['verified','proven','served'] LOOP
    IF v_scrubbed ~ ('\m' || lower(v_term) || '\M') THEN
      RAISE EXCEPTION
        'Import provenance summary contains forbidden overclaim wording (word-boundary): "%"', v_term
        USING errcode = '22023';
    END IF;
  END LOOP;

  -- Step 3: multi-word/compound forbidden phrases (substring match is safe here)
  FOREACH v_term IN ARRAY ARRAY[
    'system-observed', 'verified service', 'native evidence chain',
    'cryptographically proven', 'verified compliance', 'native tenaqo',
    'legally compliant', 'native event'
  ] LOOP
    IF v_scrubbed LIKE '%' || lower(v_term) || '%' THEN
      RAISE EXCEPTION
        'Import provenance summary contains forbidden overclaim wording: "%"', v_term
        USING errcode = '22023';
    END IF;
  END LOOP;

  RETURN public._append_evidence_provenance_event(
    p_account_id      => p_account_id,
    p_entity_type     => p_entity_type,
    p_entity_id       => p_entity_id,
    p_event_type      => p_event_type,
    p_actor_type      => 'integration',
    p_actor_user_id   => NULL,
    p_actor_role      => 'import',
    p_occurred_at     => NOW(),
    p_summary         => p_summary,
    p_source_type     => 'spreadsheet_import',
    p_source_id       => p_source_id,
    p_metadata        => coalesce(p_metadata, '{}'::jsonb)
                         || jsonb_build_object('triggered_by_user_id', auth.uid()),
    p_visibility      => 'internal',
    p_idempotency_key => p_idempotency_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_import_provenance_event(
  uuid, text, uuid, text, text, uuid, jsonb, text
) TO authenticated;
REVOKE ALL ON FUNCTION public.record_import_provenance_event(
  uuid, text, uuid, text, text, uuid, jsonb, text
) FROM public, anon;

COMMENT ON FUNCTION public.record_import_provenance_event(
  uuid, text, uuid, text, text, uuid, jsonb, text
) IS
  'Public entry point for attested-import provenance events. '
  'Wraps _append_evidence_provenance_event with actor_type=integration and source_type=spreadsheet_import. '
  'occurred_at is always NOW() (import execution time); original dates must go in p_metadata only. '
  'Cross-account deny enforced. Anon deny enforced. Honesty guard rejects overclaim wording. '
  'P-009 / D4 / RB-02.';

-- ─── §6  _import_normalise_address helper (internal) ─────────────────────────
--
-- Conservative address normalisation for Tier-2 matching.
-- KEEP: flat/unit numbers, house suffixes, building names.
-- Operations: lowercase, trim, collapse multiple spaces.
-- Does NOT strip hyphens or slashes (used in flat refs like 3/1, 4-B).
-- Does NOT match postcode against city — postcode field does not exist.

CREATE OR REPLACE FUNCTION public._import_normalise_address(p_address TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    lower(trim(coalesce(p_address, ''))),
    '\s+', ' ', 'g'
  );
$$;

REVOKE ALL ON FUNCTION public._import_normalise_address(text)
  FROM public, anon, authenticated;

-- ─── §7  process_import_batch RPC ────────────────────────────────────────────
--
-- Main import entry point. Receives parsed rows for one tab as a JSONB array.
-- Row-level partial commit: each row is processed in an EXCEPTION block.
-- One bad row does not block others. Orphan rows (no property match) → needs_review.
-- No fuzzy matching; no silent overwrites; no all-or-nothing.
--
-- Returns: { batch_id, total, imported, skipped, needs_review, error, rows }

DROP FUNCTION IF EXISTS public.process_import_batch(uuid, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.process_import_batch(
  p_account_id      UUID,
  p_tab             TEXT,
  p_rows            JSONB,
  p_source_filename TEXT,
  p_source_file_hash TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id     UUID   := gen_random_uuid();
  v_tab          TEXT   := lower(trim(coalesce(p_tab, '')));
  v_row_count    INTEGER;
  v_row          JSONB;
  v_row_num      INTEGER;
  v_entity_id    UUID;
  v_row_status   TEXT;
  v_review       TEXT;
  v_err_msg      TEXT;
  v_results      JSONB  := '[]'::JSONB;
  v_result_row   JSONB;

  -- match variables
  v_address_norm     TEXT;
  v_ext_ref          TEXT;
  v_existing_prop_id UUID;
  v_prop_id          UUID;
  v_tenant_id        UUID;
  v_lease_id         UUID;
  v_req_id           UUID;
  v_req_key          TEXT;
  v_expires_at       DATE;
  v_completed_at     TIMESTAMPTZ;
  v_status_val       TEXT;
  v_priority_val     TEXT;

  -- counts
  v_cnt_imported    INTEGER := 0;
  v_cnt_skipped     INTEGER := 0;
  v_cnt_review      INTEGER := 0;
  v_cnt_error       INTEGER := 0;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  IF NOT public.user_can_manage_account(p_account_id) THEN
    RAISE EXCEPTION 'Access denied' USING errcode = '42501';
  END IF;

  -- Validate tab
  IF v_tab NOT IN ('properties', 'tenancies', 'compliance', 'maintenance') THEN
    RAISE EXCEPTION 'Invalid tab: %. Must be: properties, tenancies, compliance, maintenance', p_tab;
  END IF;

  v_row_count := jsonb_array_length(coalesce(p_rows, '[]'::JSONB));

  -- Create batch record
  INSERT INTO public.import_batches (
    id, account_id, source_filename, source_file_hash, tab,
    triggered_by, status, total_rows
  ) VALUES (
    v_batch_id, p_account_id, p_source_filename,
    nullif(btrim(coalesce(p_source_file_hash, '')), ''),
    v_tab, auth.uid(), 'processing', v_row_count
  );

  -- ── Per-row processing (row-level partial commit via EXCEPTION blocks) ──────
  FOR v_row_num IN 0..(v_row_count - 1) LOOP
    v_row        := p_rows->v_row_num;
    v_entity_id  := NULL;
    v_row_status := 'error';
    v_review     := NULL;
    v_err_msg    := NULL;

    BEGIN  -- EXCEPTION block = implicit savepoint; rollback on error

      CASE v_tab

        -- ── PROPERTIES ──────────────────────────────────────────────────────
        WHEN 'properties' THEN

          -- Require address
          IF nullif(btrim(coalesce(v_row->>'address', '')), '') IS NULL THEN
            RAISE EXCEPTION 'address is required';
          END IF;

          v_ext_ref      := nullif(btrim(coalesce(v_row->>'external_property_ref', '')), '');
          v_address_norm := public._import_normalise_address(v_row->>'address');
          v_existing_prop_id := NULL;

          -- Tier 1: exact external_property_ref match (account-scoped)
          IF v_ext_ref IS NOT NULL THEN
            SELECT id INTO v_existing_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND btrim(coalesce(external_property_ref, '')) = v_ext_ref
            LIMIT 1;

            IF v_existing_prop_id IS NOT NULL THEN
              -- Check that address is consistent (conflict detection)
              IF public._import_normalise_address(
                   (SELECT address FROM public.properties WHERE id = v_existing_prop_id)
                 ) <> v_address_norm THEN
                v_review := 'external_property_ref matches an existing property with a different address';
                v_row_status := 'needs_review';
                RAISE EXCEPTION 'conflict';
              END IF;
              -- Matched; skip (no overwrite)
              v_entity_id  := v_existing_prop_id;
              v_row_status := 'skipped';
              v_review     := 'matched by external_property_ref — no changes made';
              RAISE EXCEPTION 'done';
            END IF;
          END IF;

          -- Tier 2: normalised address match (account-scoped)
          SELECT id INTO v_existing_prop_id
          FROM public.properties
          WHERE account_id = p_account_id
            AND public._import_normalise_address(address) = v_address_norm
          LIMIT 1;

          IF v_existing_prop_id IS NOT NULL THEN
            -- Set external_ref if provided and not already set
            IF v_ext_ref IS NOT NULL THEN
              UPDATE public.properties
              SET external_property_ref = v_ext_ref
              WHERE id = v_existing_prop_id
                AND (external_property_ref IS NULL OR btrim(external_property_ref) = '');
            END IF;
            v_entity_id  := v_existing_prop_id;
            v_row_status := 'skipped';
            v_review     := 'matched by address — no changes made';
            RAISE EXCEPTION 'done';
          END IF;

          -- No match → INSERT new property
          INSERT INTO public.properties (
            account_id, owner_id, address, city, rent, size,
            external_property_ref, status
          ) VALUES (
            p_account_id,
            auth.uid(),
            btrim(v_row->>'address'),
            btrim(coalesce(v_row->>'city', '')),
            CASE WHEN nullif(btrim(coalesce(v_row->>'rent', '')), '') IS NOT NULL
                 THEN (v_row->>'rent')::NUMERIC ELSE 0 END,
            nullif(btrim(coalesce(v_row->>'size', '')), ''),
            v_ext_ref,
            'Wolne'
          )
          RETURNING id INTO v_entity_id;

          -- Attested-import provenance (non-blocking; logged internally)
          BEGIN
            PERFORM public.record_import_provenance_event(
              p_account_id  => p_account_id,
              p_entity_type => 'property',
              p_entity_id   => v_entity_id,
              p_event_type  => 'property.imported',
              p_summary     => 'Property imported from landlord spreadsheet. '
                               'Attested import record — not a Tenaqo-observed event.',
              p_source_id   => v_batch_id,
              p_metadata    => jsonb_build_object(
                'import_batch_id', v_batch_id,
                'import_source',   'spreadsheet_v1',
                'row_number',      v_row_num + 1,
                'address',         v_row->>'address'
              ),
              p_idempotency_key => v_batch_id::TEXT || ':property:' || v_row_num::TEXT
            );
          EXCEPTION WHEN OTHERS THEN
            NULL; -- provenance failure is non-fatal for the import row
          END;

          v_row_status := 'imported';

        -- ── TENANCIES ───────────────────────────────────────────────────────
        WHEN 'tenancies' THEN

          -- Require tenant_email
          IF nullif(btrim(coalesce(v_row->>'tenant_email', '')), '') IS NULL THEN
            RAISE EXCEPTION 'tenant_email is required';
          END IF;

          -- Resolve property (required)
          v_prop_id := NULL;
          v_ext_ref := nullif(btrim(coalesce(v_row->>'external_property_ref', '')), '');

          IF v_ext_ref IS NOT NULL THEN
            SELECT id INTO v_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND btrim(coalesce(external_property_ref, '')) = v_ext_ref
            LIMIT 1;
          END IF;

          IF v_prop_id IS NULL
             AND nullif(btrim(coalesce(v_row->>'address', '')), '') IS NOT NULL THEN
            SELECT id INTO v_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND public._import_normalise_address(address)
                = public._import_normalise_address(v_row->>'address')
            LIMIT 1;
          END IF;

          IF v_prop_id IS NULL THEN
            v_review := 'Could not match a property. '
              'Provide a matching address or external_property_ref, '
              'or import the property row first.';
            v_row_status := 'needs_review';
            RAISE EXCEPTION 'orphan';
          END IF;

          -- Tenant dedup: Tier 1 = account_id + lower(email)
          v_tenant_id := NULL;
          SELECT id INTO v_tenant_id
          FROM public.tenants
          WHERE account_id = p_account_id
            AND lower(trim(coalesce(email, ''))) = lower(trim(v_row->>'tenant_email'))
            AND archived_at IS NULL
          LIMIT 1;

          -- Tier 2: name + property (only if Tier 1 failed and name provided)
          IF v_tenant_id IS NULL
             AND nullif(btrim(coalesce(v_row->>'tenant_name', '')), '') IS NOT NULL THEN
            SELECT id INTO v_tenant_id
            FROM public.tenants
            WHERE account_id = p_account_id
              AND property_id = v_prop_id
              AND lower(trim(coalesce(name, '')))
                = lower(trim(coalesce(v_row->>'tenant_name', '')))
              AND archived_at IS NULL
            LIMIT 1;
          END IF;

          -- Create tenant if not found
          IF v_tenant_id IS NULL THEN
            INSERT INTO public.tenants (
              account_id, owner_id, property_id, name, email, phone, status
            ) VALUES (
              p_account_id,
              auth.uid(),
              v_prop_id,
              coalesce(nullif(btrim(coalesce(v_row->>'tenant_name', '')), ''),
                       split_part(lower(v_row->>'tenant_email'), '@', 1)),
              lower(trim(v_row->>'tenant_email')),
              nullif(btrim(coalesce(v_row->>'tenant_phone', '')), ''),
              'active'
            )
            RETURNING id INTO v_tenant_id;
          END IF;

          -- Check for existing lease on this property + tenant
          SELECT id INTO v_lease_id
          FROM public.leases
          WHERE account_id  = p_account_id
            AND property_id = v_prop_id
            AND tenant_id   = v_tenant_id
            AND status NOT IN ('ended', 'cancelled')
          LIMIT 1;

          IF v_lease_id IS NOT NULL THEN
            v_entity_id  := v_lease_id;
            v_row_status := 'skipped';
            v_review     := 'Active lease already exists for this tenant and property';
            RAISE EXCEPTION 'done';
          END IF;

          -- ── Fix A (E-172): Derive renewal_status from spreadsheet 'status' column
          -- or fall back to date-based derivation. Never silently coerce to 'active'.
          -- Allowed values from leases_renewal_status CHECK constraint:
          --   active, expiring_soon, renewal_in_progress, renewed, ended
          v_status_val := lower(trim(coalesce(nullif(v_row->>'status', ''), '')));

          IF v_status_val NOT IN ('', 'active', 'expiring_soon', 'renewal_in_progress', 'renewed', 'ended') THEN
            v_review := 'Unrecognised lease status value "' || (v_row->>'status') || '". '
                        'Accepted values: active, expiring_soon, renewal_in_progress, renewed, ended. '
                        'Row sent to review — no lease imported.';
            v_row_status := 'needs_review';
            RAISE EXCEPTION 'unrecognised_lease_status';
          END IF;

          IF v_status_val = '' THEN
            -- Status absent/null: derive from lease_end_date
            -- Past end_date → ended; open-ended or future end_date → active
            IF nullif(v_row->>'end_date', '') IS NOT NULL
               AND (v_row->>'end_date')::DATE < CURRENT_DATE THEN
              v_status_val := 'ended';
            ELSE
              v_status_val := 'active';  -- open-ended tenancy is a positive active state
            END IF;
          END IF;
          -- v_status_val now holds a valid, schema-checked renewal_status value

          -- Create lease
          INSERT INTO public.leases (
            account_id, property_id, tenant_id,
            start_date, end_date, lease_start_date, lease_end_date,
            rent_amount, rent_frequency, deposit_amount, status,
            renewal_status, created_by
          ) VALUES (
            p_account_id, v_prop_id, v_tenant_id,
            nullif(v_row->>'start_date', '')::DATE,
            nullif(v_row->>'end_date', '')::DATE,
            nullif(v_row->>'start_date', '')::DATE,
            nullif(v_row->>'end_date', '')::DATE,
            CASE WHEN nullif(v_row->>'rent_amount', '') IS NOT NULL
                 THEN (v_row->>'rent_amount')::NUMERIC(12,2) ELSE NULL END,
            coalesce(nullif(btrim(coalesce(v_row->>'rent_frequency', '')), ''), 'monthly'),
            CASE WHEN nullif(v_row->>'deposit_amount', '') IS NOT NULL
                 THEN (v_row->>'deposit_amount')::NUMERIC(12,2) ELSE NULL END,
            'active',
            v_status_val,
            auth.uid()
          )
          RETURNING id INTO v_entity_id;

          BEGIN
            PERFORM public.record_import_provenance_event(
              p_account_id  => p_account_id,
              p_entity_type => 'tenancy',
              p_entity_id   => v_entity_id,
              p_event_type  => 'tenancy.imported',
              p_summary     => 'Tenancy imported from landlord spreadsheet. '
                               'Attested import record — not a Tenaqo-observed event.',
              p_source_id   => v_batch_id,
              p_metadata    => jsonb_build_object(
                'import_batch_id', v_batch_id,
                'import_source',   'spreadsheet_v1',
                'row_number',      v_row_num + 1,
                'property_id',     v_prop_id,
                'tenant_id',       v_tenant_id
              ),
              p_idempotency_key => v_batch_id::TEXT || ':tenancy:' || v_row_num::TEXT
            );
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;

          v_row_status := 'imported';

        -- ── COMPLIANCE ──────────────────────────────────────────────────────
        WHEN 'compliance' THEN

          v_req_key := lower(trim(coalesce(v_row->>'requirement_type', '')));
          IF v_req_key = '' THEN
            RAISE EXCEPTION 'requirement_type is required';
          END IF;

          -- Resolve property
          v_prop_id := NULL;
          v_ext_ref := nullif(btrim(coalesce(v_row->>'external_property_ref', '')), '');

          IF v_ext_ref IS NOT NULL THEN
            SELECT id INTO v_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND btrim(coalesce(external_property_ref, '')) = v_ext_ref
            LIMIT 1;
          END IF;

          IF v_prop_id IS NULL
             AND nullif(btrim(coalesce(v_row->>'address', '')), '') IS NOT NULL THEN
            SELECT id INTO v_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND public._import_normalise_address(address)
                = public._import_normalise_address(v_row->>'address')
            LIMIT 1;
          END IF;

          IF v_prop_id IS NULL THEN
            v_review := 'Could not match a property — import the property row first.';
            v_row_status := 'needs_review';
            RAISE EXCEPTION 'orphan';
          END IF;

          -- Resolve requirement_id
          SELECT cr.id INTO v_req_id
          FROM public.compliance_requirements cr
          JOIN public.compliance_templates ct ON ct.id = cr.template_id
          WHERE cr.requirement_key = v_req_key
            AND ct.country_code = 'GB'
            AND ct.jurisdiction = 'england'
            AND cr.active = true
          LIMIT 1;

          IF v_req_id IS NULL THEN
            v_review := format(
              'Unknown requirement_type: "%s". '
              'Supported: epc, gas_safety_certificate, eicr, '
              'deposit_protection_certificate, deposit_prescribed_information, '
              'how_to_rent, tenancy_agreement, right_to_rent_check.',
              v_req_key
            );
            v_row_status := 'needs_review';
            RAISE EXCEPTION 'unknown requirement';
          END IF;

          -- Resolve optional tenancy_id (lease linking)
          v_lease_id := NULL;
          IF nullif(v_row->>'tenant_email', '') IS NOT NULL THEN
            SELECT t.id INTO v_tenant_id
            FROM public.tenants t
            WHERE t.account_id = p_account_id
              AND lower(trim(coalesce(t.email, ''))) = lower(trim(v_row->>'tenant_email'))
              AND t.archived_at IS NULL
            LIMIT 1;

            IF v_tenant_id IS NOT NULL THEN
              SELECT id INTO v_lease_id
              FROM public.leases
              WHERE account_id  = p_account_id
                AND property_id = v_prop_id
                AND tenant_id   = v_tenant_id
                AND status NOT IN ('ended', 'cancelled')
              LIMIT 1;
            END IF;
          END IF;

          -- Idempotency: skip if identical row already exists
          IF EXISTS (
            SELECT 1 FROM public.tenancy_compliance_items
            WHERE account_id    = p_account_id
              AND property_id   = v_prop_id
              AND requirement_id = v_req_id
              AND (v_lease_id IS NULL OR tenancy_id = v_lease_id)
              AND status NOT IN ('missing', 'expired')
          ) THEN
            v_row_status := 'skipped';
            v_review     := 'Compliance record already exists for this property and requirement';
            RAISE EXCEPTION 'done';
          END IF;

          v_expires_at   := nullif(v_row->>'expiry_date', '')::DATE;
          v_completed_at := CASE WHEN nullif(v_row->>'completed_date', '') IS NOT NULL
                                 THEN (v_row->>'completed_date')::DATE::TIMESTAMPTZ
                                 ELSE NULL END;

          INSERT INTO public.tenancy_compliance_items (
            account_id, property_id, tenant_id, tenancy_id,
            requirement_id, status, expires_at, completed_at,
            notes, created_by
          ) VALUES (
            p_account_id, v_prop_id,
            CASE WHEN v_lease_id IS NOT NULL THEN v_tenant_id ELSE NULL END,
            v_lease_id,
            v_req_id,
            'logged',
            v_expires_at,
            v_completed_at,
            -- Deposit scheme ref goes in notes (no dedicated column)
            CASE WHEN nullif(btrim(coalesce(v_row->>'scheme_reference', '')), '') IS NOT NULL
                 THEN 'Imported deposit scheme/reference: ' || btrim(v_row->>'scheme_reference')
                      || coalesce(E'\n' || btrim(v_row->>'notes'), '')
                 ELSE nullif(btrim(coalesce(v_row->>'notes', '')), '')
            END,
            auth.uid()
          )
          RETURNING id INTO v_entity_id;

          BEGIN
            PERFORM public.record_import_provenance_event(
              p_account_id  => p_account_id,
              p_entity_type => 'compliance_item',
              p_entity_id   => v_entity_id,
              p_event_type  => 'compliance_item.imported',
              p_summary     => format(
                'Compliance record "%s" imported from landlord spreadsheet. '
                'Attested import custody — dates are landlord-supplied, '
                'not independently verified by Tenaqo.',
                v_req_key
              ),
              p_source_id   => v_batch_id,
              p_metadata    => jsonb_build_object(
                'import_batch_id',  v_batch_id,
                'import_source',    'spreadsheet_v1',
                'row_number',       v_row_num + 1,
                'requirement_key',  v_req_key,
                'property_id',      v_prop_id,
                'spreadsheet_expiry_date',    v_row->>'expiry_date',
                'spreadsheet_completed_date', v_row->>'completed_date'
              ),
              p_idempotency_key => v_batch_id::TEXT || ':compliance:' || v_row_num::TEXT
            );
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;

          v_row_status := 'imported';

        -- ── MAINTENANCE ─────────────────────────────────────────────────────
        WHEN 'maintenance' THEN

          IF nullif(btrim(coalesce(v_row->>'title', '')), '') IS NULL THEN
            RAISE EXCEPTION 'title is required';
          END IF;

          -- Resolve property
          v_prop_id := NULL;
          v_ext_ref := nullif(btrim(coalesce(v_row->>'external_property_ref', '')), '');

          IF v_ext_ref IS NOT NULL THEN
            SELECT id INTO v_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND btrim(coalesce(external_property_ref, '')) = v_ext_ref
            LIMIT 1;
          END IF;

          IF v_prop_id IS NULL
             AND nullif(btrim(coalesce(v_row->>'address', '')), '') IS NOT NULL THEN
            SELECT id INTO v_prop_id
            FROM public.properties
            WHERE account_id = p_account_id
              AND public._import_normalise_address(address)
                = public._import_normalise_address(v_row->>'address')
            LIMIT 1;
          END IF;

          IF v_prop_id IS NULL THEN
            v_review := 'Could not match a property — import the property row first.';
            v_row_status := 'needs_review';
            RAISE EXCEPTION 'orphan';
          END IF;

          -- Validate and default enums
          v_status_val := coalesce(
            nullif(lower(trim(coalesce(v_row->>'status', ''))), ''),
            'closed'
          );
          IF v_status_val NOT IN ('open','in_progress','waiting','resolved','closed') THEN
            v_status_val := 'closed';
          END IF;

          v_priority_val := coalesce(
            nullif(lower(trim(coalesce(v_row->>'priority', ''))), ''),
            'normal'
          );
          IF v_priority_val NOT IN ('low','normal','high','urgent') THEN
            v_priority_val := 'normal';
          END IF;

          -- Decision M: maintenance re-import duplicate guard.
          -- v1 has no stable import identity for maintenance rows.
          -- If ANY maintenance_request with the same title+property already exists
          -- for this account, mark needs_review rather than silently duplicating.
          -- Does NOT auto-dedup (user must confirm new vs discard).
          IF EXISTS (
            SELECT 1 FROM public.maintenance_requests
            WHERE account_id  = p_account_id
              AND property_id = v_prop_id
              AND lower(trim(coalesce(title, '')))
                = lower(trim(btrim(coalesce(v_row->>'title', ''))))
          ) THEN
            v_review := 'Potential duplicate maintenance record — a request with this title '
              'already exists for this property. '
              'v1 import has no stable identity key for maintenance rows. '
              'Review and confirm create-new or discard.';
            v_row_status := 'needs_review';
            RAISE EXCEPTION 'maintenance_potential_duplicate';
          END IF;

          INSERT INTO public.maintenance_requests (
            account_id, property_id, title, description, priority, status
          ) VALUES (
            p_account_id, v_prop_id,
            btrim(v_row->>'title'),
            nullif(btrim(coalesce(v_row->>'description', '')), ''),
            v_priority_val,
            v_status_val
          )
          RETURNING id INTO v_entity_id;

          BEGIN
            PERFORM public.record_import_provenance_event(
              p_account_id  => p_account_id,
              p_entity_type => 'maintenance_request',
              p_entity_id   => v_entity_id,
              p_event_type  => 'maintenance.imported',
              p_summary     => 'Maintenance record imported from landlord spreadsheet. '
                               'Attested import record — not a Tenaqo-observed event.',
              p_source_id   => v_batch_id,
              p_metadata    => jsonb_build_object(
                'import_batch_id', v_batch_id,
                'import_source',   'spreadsheet_v1',
                'row_number',      v_row_num + 1,
                'property_id',     v_prop_id,
                'title',           v_row->>'title'
              ),
              p_idempotency_key => v_batch_id::TEXT || ':maintenance:' || v_row_num::TEXT
            );
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;

          v_row_status := 'imported';

      END CASE;

    EXCEPTION
      WHEN OTHERS THEN
        IF v_row_status NOT IN ('needs_review', 'skipped') THEN
          v_row_status := 'error';
          v_err_msg    := SQLERRM;
          v_entity_id  := NULL;
        END IF;
        -- 'done' pseudo-exception for early exit (skip/conflict) — already set
    END;  -- EXCEPTION block

    -- Tally
    CASE v_row_status
      WHEN 'imported'     THEN v_cnt_imported := v_cnt_imported + 1;
      WHEN 'skipped'      THEN v_cnt_skipped  := v_cnt_skipped  + 1;
      WHEN 'needs_review' THEN v_cnt_review   := v_cnt_review   + 1;
      ELSE                     v_cnt_error    := v_cnt_error    + 1;
    END CASE;

    -- Record row audit
    INSERT INTO public.import_batch_rows (
      account_id, batch_id, tab, row_number,
      status, entity_type, entity_id,
      raw_row, review_reason, error_message
    ) VALUES (
      p_account_id, v_batch_id, v_tab, v_row_num + 1,
      v_row_status, v_tab, v_entity_id,
      v_row, v_review, v_err_msg
    );

    v_results := v_results || jsonb_build_object(
      'row_number',    v_row_num + 1,
      'status',        v_row_status,
      'entity_id',     v_entity_id,
      'review_reason', coalesce(v_review, v_err_msg)
    );

  END LOOP;  -- per-row

  -- Finalise batch
  UPDATE public.import_batches SET
    status       = CASE
                     WHEN v_cnt_error > 0 OR v_cnt_review > 0 THEN 'partial'
                     ELSE 'complete'
                   END,
    imported_rows = v_cnt_imported,
    skipped_rows  = v_cnt_skipped,
    review_rows   = v_cnt_review,
    error_rows    = v_cnt_error,
    completed_at  = NOW(),
    updated_at    = NOW()
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id',     v_batch_id,
    'total',        v_row_count,
    'imported',     v_cnt_imported,
    'skipped',      v_cnt_skipped,
    'needs_review', v_cnt_review,
    'error',        v_cnt_error,
    'rows',         v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_import_batch(uuid, text, jsonb, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.process_import_batch(uuid, text, jsonb, text, text)
  FROM public, anon;

COMMENT ON FUNCTION public.process_import_batch(uuid, text, jsonb, text, text) IS
  'Spreadsheet import batch processor. Row-level partial commit via EXCEPTION blocks. '
  'No fuzzy matching; no silent overwrites; no all-or-nothing. '
  'Each row: imported | skipped | needs_review | error. '
  'P-009 / spreadsheet v1 only.';

-- ─── §8  Grants ───────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.import_batches     TO authenticated;
GRANT SELECT, INSERT         ON public.import_batch_rows  TO authenticated;
