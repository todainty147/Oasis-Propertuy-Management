-- =============================================================================
-- Migration: Fix compliance import provenance fail-closed
-- Ticket:    defect / custody-invariant violation
-- Branch:    codex/hmrc-e1-hardening
-- =============================================================================
--
-- DEFECT
-- ------
-- process_import_batch (compliance tab) produced the summary:
--
--   'Compliance record "%s" imported from landlord spreadsheet. '
--   'Attested import custody — dates are landlord-supplied, '
--   'not independently verified by Tenaqo.'
--
-- The word "verified" triggers the T-INTEGRITY-2 honesty guard
-- (word-boundary regex \mverified\M) inside record_import_provenance_event,
-- raising errcode 22023.
--
-- The provenance call was wrapped in EXCEPTION WHEN OTHERS THEN NULL (silent
-- swallow), so the error was discarded. Result:
--
--   1. tenancy_compliance_items row is created and returned as status=imported
--   2. trg_set_compliance_item_import_batch never fires (no provenance event)
--   3. tenancy_compliance_items.import_batch_id remains NULL
--   4. compliance_gap_unified.is_attested_import = false
--   5. Imported row appears as a native Tenaqo record (no attestation badge)
--
-- Custody invariant violated:
--   status=imported ⟹ import_batch_id=batch_id ⟹ is_attested_import=true
--   ⟹ provenance event exists
--
-- FIX
-- ---
-- 2a. Rephrase the compliance summary to remove the forbidden word "verified".
--     New wording: "Compliance dates supplied by the landlord's spreadsheet;
--                   Tenaqo has not checked the underlying record."
--     The honesty-guard whitelist is NOT broadened.
--
-- 2b. Remove the silent swallow from the compliance-import provenance call.
--     The outer per-row EXCEPTION block will now catch provenance failures,
--     roll back the compliance item INSERT, write status=error in
--     import_batch_rows, and continue to the next row. A row that is reported
--     as imported=true will always have its provenance event written.
--
-- 2c. Add import_batch_id directly to the compliance INSERT. This makes the
--     custody link explicit and non-dependent solely on the trigger side-effect.
--     The trigger (trg_set_compliance_item_import_batch) remains in place as a
--     secondary backstop; writing the same value directly does not conflict
--     because the trigger's WHERE clause is:
--       AND import_batch_id IS NULL  -- idempotent; never overwrite existing value
--     A pre-set value means the trigger's UPDATE touches zero rows, which is safe.
--
-- =============================================================================

-- ── Idempotency guard ─────────────────────────────────────────────────────────
-- This migration replaces process_import_batch with CREATE OR REPLACE, so it
-- is safe to replay.

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

          -- Create lease
          INSERT INTO public.leases (
            account_id, property_id, tenant_id,
            start_date, end_date, lease_start_date, lease_end_date,
            rent_amount, rent_frequency, deposit_amount, status, created_by
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

          -- FIX 2c: import_batch_id set directly on INSERT.
          -- The trigger trg_set_compliance_item_import_batch also sets this column
          -- after the provenance event is written. Direct assignment here makes the
          -- custody link explicit and non-dependent solely on the trigger side-effect.
          -- The trigger's WHERE clause (AND import_batch_id IS NULL) is idempotent:
          -- if the column is already set, the UPDATE touches zero rows — no conflict.
          INSERT INTO public.tenancy_compliance_items (
            account_id, property_id, tenant_id, tenancy_id,
            requirement_id, status, expires_at, completed_at,
            notes, created_by,
            import_batch_id
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
            auth.uid(),
            -- FIX 2c: direct assignment (custody invariant: status=imported ⟹ import_batch_id set)
            v_batch_id
          )
          RETURNING id INTO v_entity_id;

          -- FIX 2b: silent swallow REMOVED from compliance provenance path.
          -- Previously: EXCEPTION WHEN OTHERS THEN NULL — this discarded provenance
          -- failures, leaving import_batch_id NULL on the compliance item and
          -- is_attested_import=false in compliance_gap_unified.
          --
          -- Now: the provenance call is NOT wrapped in its own EXCEPTION block.
          -- If record_import_provenance_event raises (e.g. honesty-guard violation),
          -- the error propagates to the outer per-row EXCEPTION block, which:
          --   1. Rolls back the entire row (including the INSERT above)
          --   2. Sets v_row_status = 'error'
          --   3. Records the error in import_batch_rows
          --   4. Continues to the next row (partial commit preserved)
          --
          -- FIX 2a: summary rephrased — "verified" removed to pass honesty guard.
          -- The guard checks word-boundary \mverified\M. Old wording:
          --   'not independently verified by Tenaqo.'
          -- New wording does not contain the word "verified":
          PERFORM public.record_import_provenance_event(
            p_account_id  => p_account_id,
            p_entity_type => 'compliance_item',
            p_entity_id   => v_entity_id,
            p_event_type  => 'compliance_item.imported',
            p_summary     => format(
              'Compliance record "%s" imported from landlord spreadsheet. '
              'Attested import custody — compliance dates supplied by the '
              'landlord''s spreadsheet; Tenaqo has not checked the underlying record.',
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
          -- If the PERFORM above raises, control jumps to the outer EXCEPTION block,
          -- the savepoint is rolled back (compliance item INSERT is undone), and the
          -- row is recorded as status=error. No silent swallow.

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

COMMENT ON FUNCTION public.process_import_batch(uuid, text, jsonb, text, text) IS
  'Spreadsheet import batch processor. Row-level partial commit via EXCEPTION blocks. '
  'No fuzzy matching; no silent overwrites; no all-or-nothing. '
  'Each row: imported | skipped | needs_review | error. '
  'P-009 / spreadsheet v1 only. '
  'Migration 20260714000000: compliance summary rephrased (FIX-2a), '
  'provenance swallow removed from compliance path (FIX-2b), '
  'import_batch_id set directly on compliance INSERT (FIX-2c).';
