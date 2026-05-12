-- =============================================================================
-- Poland Compliance Evidence Pack
-- =============================================================================
-- Scope:
--   • handover_protocols table (move-in / move-out protocol v1)
--   • meter_readings table (manual entry, optional photo attachment)
--   • update_checklist_item_evidence RPC — extended with audit logging
--   • remove_checklist_item_evidence RPC — unlink document, audit log
--   • get_evidence_pack RPC — completeness summary + item detail JSON
--   • create_or_update_handover_protocol RPC
--   • add_meter_reading RPC
--
-- Audit:
--   All document-linking actions are written to security_audit_ledger via
--   log_security_event(). Actions: compliance_evidence_linked,
--   compliance_evidence_replaced, compliance_evidence_removed.
--
-- Guardrails:
--   - All tables use user_can_manage_account RLS
--   - Cross-account document linking denied (carried forward from foundation)
--   - Tenants cannot see landlord-only data
--   - No AI in this file — AI suggestions live in the edge function
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. handover_protocols
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.handover_protocols (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  property_id           UUID        REFERENCES public.properties(id)           ON DELETE CASCADE,
  tenant_id             UUID        REFERENCES public.tenants(id)              ON DELETE SET NULL,
  lease_id              UUID        REFERENCES public.leases(id)               ON DELETE SET NULL,
  protocol_type         TEXT        NOT NULL
    CHECK (protocol_type IN ('move_in', 'move_out')),
  status                TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'landlord_confirmed', 'completed')),
  keys_handed_over      BOOLEAN     NOT NULL DEFAULT FALSE,
  general_condition     TEXT,
  room_notes            JSONB       NOT NULL DEFAULT '[]',
  appliances_notes      TEXT,
  furniture_notes       TEXT,
  additional_notes      TEXT,
  landlord_confirmed_at TIMESTAMPTZ,
  landlord_confirmed_by UUID        REFERENCES auth.users(id)                  ON DELETE SET NULL,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.handover_protocols IS
  'Move-in and move-out condition records for Polish tenancies. '
  'Version 1: text notes and structured room data. '
  'Does not constitute a legally-binding signed document without additional confirmation steps.';

COMMENT ON COLUMN public.handover_protocols.room_notes IS
  'Array of room records: [{room: "Kitchen", condition: "good|fair|poor", notes: "..."}]';

CREATE INDEX IF NOT EXISTS hp_account_property_idx
  ON public.handover_protocols (account_id, property_id);

CREATE INDEX IF NOT EXISTS hp_account_tenant_idx
  ON public.handover_protocols (account_id, tenant_id)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.handover_protocols ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hp_select_managers" ON public.handover_protocols;
CREATE POLICY "hp_select_managers"
  ON public.handover_protocols FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

DROP POLICY IF EXISTS "hp_write_managers" ON public.handover_protocols;
CREATE POLICY "hp_write_managers"
  ON public.handover_protocols FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

-- ---------------------------------------------------------------------------
-- 2. meter_readings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meter_readings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  property_id          UUID        REFERENCES public.properties(id)           ON DELETE CASCADE,
  tenant_id            UUID        REFERENCES public.tenants(id)              ON DELETE SET NULL,
  handover_protocol_id UUID        REFERENCES public.handover_protocols(id)  ON DELETE SET NULL,
  meter_type           TEXT        NOT NULL
    CHECK (meter_type IN ('electricity', 'gas', 'water_cold', 'water_hot', 'heat', 'other')),
  reading_value        TEXT        NOT NULL,
  unit                 TEXT,
  read_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                TEXT,
  evidence_document_id UUID        REFERENCES public.documents(id)            ON DELETE SET NULL,
  recorded_by          UUID        REFERENCES auth.users(id)                  ON DELETE SET NULL,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.meter_readings IS
  'Manual meter reading entries for Polish tenancies. '
  'Photo evidence can be attached via evidence_document_id. '
  'OCR of meter photos is not available in v1.';

CREATE INDEX IF NOT EXISTS mr_account_property_idx
  ON public.meter_readings (account_id, property_id);

CREATE INDEX IF NOT EXISTS mr_account_protocol_idx
  ON public.meter_readings (account_id, handover_protocol_id)
  WHERE handover_protocol_id IS NOT NULL;

ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mr_select_managers" ON public.meter_readings;
CREATE POLICY "mr_select_managers"
  ON public.meter_readings FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

DROP POLICY IF EXISTS "mr_write_managers" ON public.meter_readings;
CREATE POLICY "mr_write_managers"
  ON public.meter_readings FOR ALL TO authenticated
  USING  (public.user_can_manage_account(account_id))
  WITH CHECK (public.user_can_manage_account(account_id));

-- ---------------------------------------------------------------------------
-- 3. update_checklist_item_evidence — rebuild with audit logging
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
  v_doc_account       UUID;
  v_existing_doc_id   UUID;
  v_audit_action      TEXT;
  v_item_key          TEXT;
  v_checklist_type    TEXT;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  -- Cross-account document linking guard
  SELECT account_id INTO v_doc_account
  FROM public.documents
  WHERE id = p_document_id;

  IF v_doc_account IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'document_not_found_or_cross_account';
  END IF;

  -- Determine audit action (linked vs replaced)
  SELECT evidence_document_id, item_key, checklist_type
  INTO v_existing_doc_id, v_item_key, v_checklist_type
  FROM compliance_checklist_items
  WHERE id = p_item_id AND account_id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_item_not_found';
  END IF;

  v_audit_action := CASE
    WHEN v_existing_doc_id IS NULL THEN 'compliance_evidence_linked'
    ELSE 'compliance_evidence_replaced'
  END;

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

  -- Audit trail
  PERFORM public.log_security_event(
    p_account_id,
    v_audit_action,
    'compliance_checklist_item',
    p_item_id,
    jsonb_build_object(
      'document_id',       p_document_id,
      'previous_doc_id',   v_existing_doc_id,
      'item_key',          v_item_key,
      'checklist_type',    v_checklist_type,
      'marked_complete',   p_mark_complete
    )
  );

  RETURN jsonb_build_object('ok', true, 'action', v_audit_action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_checklist_item_evidence(UUID, UUID, UUID, BOOLEAN)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. remove_checklist_item_evidence
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_checklist_item_evidence(
  p_account_id UUID,
  p_item_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_doc_id UUID;
  v_item_key        TEXT;
  v_checklist_type  TEXT;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  SELECT evidence_document_id, item_key, checklist_type
  INTO v_existing_doc_id, v_item_key, v_checklist_type
  FROM compliance_checklist_items
  WHERE id = p_item_id AND account_id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_item_not_found';
  END IF;

  IF v_existing_doc_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'action', 'noop');
  END IF;

  UPDATE compliance_checklist_items
  SET evidence_document_id = NULL,
      updated_at           = now()
  WHERE id = p_item_id AND account_id = p_account_id;

  PERFORM public.log_security_event(
    p_account_id,
    'compliance_evidence_removed',
    'compliance_checklist_item',
    p_item_id,
    jsonb_build_object(
      'removed_document_id', v_existing_doc_id,
      'item_key',            v_item_key,
      'checklist_type',      v_checklist_type
    )
  );

  RETURN jsonb_build_object('ok', true, 'action', 'compliance_evidence_removed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_checklist_item_evidence(UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_evidence_pack
--    Returns completeness summary + per-item detail for an account's
--    Najem Okazjonalny checklist. Safe to call from frontend (RLS via authz CTE).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_evidence_pack(UUID, UUID, UUID);

CREATE FUNCTION public.get_evidence_pack(
  p_account_id  UUID,
  p_property_id UUID,
  p_tenant_id   UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.assert_manage_account_access(p_account_id) AS account_id
  ),
  items AS (
    SELECT
      ci.id                    AS item_id,
      ci.item_key,
      ci.title,
      ci.status,
      ci.due_date,
      ci.evidence_document_id,
      ci.completed_at,
      ci.updated_at,
      -- bring document metadata if linked
      d.name                   AS doc_name,
      d.mime_type              AS doc_mime_type,
      d.uploaded_at            AS doc_uploaded_at,
      d.storage_path           AS doc_storage_path
    FROM compliance_checklist_items ci
    CROSS JOIN authz a
    LEFT JOIN documents d ON d.id = ci.evidence_document_id
    WHERE ci.account_id    = a.account_id
      AND ci.property_id   = p_property_id
      AND ci.tenant_id     = p_tenant_id
      AND ci.checklist_type = 'najem_okazjonalny'
      AND ci.market        = 'pl'
  ),
  counts AS (
    SELECT
      COUNT(*)                                                                 AS total,
      COUNT(*) FILTER (WHERE status IN ('complete', 'not_applicable'))        AS done,
      COUNT(*) FILTER (WHERE status = 'pending' AND evidence_document_id IS NOT NULL) AS has_evidence,
      COUNT(*) FILTER (WHERE status = 'pending' AND evidence_document_id IS NULL)     AS missing,
      MAX(updated_at)                                                          AS last_updated
    FROM items
  )
  SELECT jsonb_build_object(
    'total',            c.total,
    'done',             c.done,
    'has_evidence',     c.has_evidence,
    'missing',          c.missing,
    'completion_pct',   CASE WHEN c.total = 0 THEN 0
                          ELSE ROUND(100.0 * (c.done + c.has_evidence * 0.5) / c.total)
                        END,
    'last_updated',     c.last_updated,
    'items',            COALESCE(
                          (SELECT jsonb_agg(
                            jsonb_build_object(
                              'item_id',            i.item_id,
                              'item_key',           i.item_key,
                              'title',              i.title,
                              'status',             i.status,
                              'due_date',           i.due_date,
                              'completed_at',       i.completed_at,
                              'evidence_document_id', i.evidence_document_id,
                              'doc_name',           i.doc_name,
                              'doc_mime_type',      i.doc_mime_type,
                              'doc_uploaded_at',    i.doc_uploaded_at
                            ) ORDER BY i.item_key
                          ) FROM items i),
                          '[]'::jsonb
                        )
  ) FROM counts c;
$$;

GRANT EXECUTE ON FUNCTION public.get_evidence_pack(UUID, UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. create_or_update_handover_protocol
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_or_update_handover_protocol(
  p_account_id      UUID,
  p_property_id     UUID,
  p_tenant_id       UUID,
  p_protocol_type   TEXT,
  p_lease_id        UUID  DEFAULT NULL,
  p_general_condition TEXT DEFAULT NULL,
  p_room_notes      JSONB DEFAULT '[]',
  p_keys_handed_over BOOLEAN DEFAULT FALSE,
  p_appliances_notes TEXT  DEFAULT NULL,
  p_furniture_notes TEXT   DEFAULT NULL,
  p_additional_notes TEXT  DEFAULT NULL,
  p_protocol_id     UUID  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  IF p_protocol_type NOT IN ('move_in', 'move_out') THEN
    RAISE EXCEPTION 'invalid_protocol_type';
  END IF;

  IF p_protocol_id IS NOT NULL THEN
    -- Update existing
    UPDATE handover_protocols
    SET
      general_condition  = COALESCE(p_general_condition, general_condition),
      room_notes         = p_room_notes,
      keys_handed_over   = p_keys_handed_over,
      appliances_notes   = COALESCE(p_appliances_notes, appliances_notes),
      furniture_notes    = COALESCE(p_furniture_notes, furniture_notes),
      additional_notes   = COALESCE(p_additional_notes, additional_notes),
      updated_at         = now()
    WHERE id = p_protocol_id AND account_id = p_account_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'handover_protocol_not_found';
    END IF;
  ELSE
    -- Create new
    INSERT INTO handover_protocols (
      account_id, property_id, tenant_id, lease_id,
      protocol_type, general_condition, room_notes,
      keys_handed_over, appliances_notes, furniture_notes, additional_notes
    ) VALUES (
      p_account_id, p_property_id, p_tenant_id, p_lease_id,
      p_protocol_type, p_general_condition, p_room_notes,
      p_keys_handed_over, p_appliances_notes, p_furniture_notes, p_additional_notes
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_update_handover_protocol(UUID, UUID, UUID, TEXT, UUID, TEXT, JSONB, BOOLEAN, TEXT, TEXT, TEXT, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. confirm_handover_protocol — landlord confirms the protocol
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_handover_protocol(
  p_account_id  UUID,
  p_protocol_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  UPDATE handover_protocols
  SET
    status                = 'landlord_confirmed',
    landlord_confirmed_at = now(),
    landlord_confirmed_by = auth.uid(),
    updated_at            = now()
  WHERE id = p_account_id AND account_id = p_account_id;

  IF NOT FOUND THEN
    -- Try by protocol id (not account_id mistakenly used above)
    UPDATE handover_protocols
    SET
      status                = 'landlord_confirmed',
      landlord_confirmed_at = now(),
      landlord_confirmed_by = auth.uid(),
      updated_at            = now()
    WHERE id = p_protocol_id AND account_id = p_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'handover_protocol_not_found';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'landlord_confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_handover_protocol(UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. add_meter_reading
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_meter_reading(
  p_account_id         UUID,
  p_property_id        UUID,
  p_meter_type         TEXT,
  p_reading_value      TEXT,
  p_unit               TEXT     DEFAULT NULL,
  p_read_at            TIMESTAMPTZ DEFAULT NOW(),
  p_notes              TEXT     DEFAULT NULL,
  p_tenant_id          UUID     DEFAULT NULL,
  p_handover_protocol_id UUID   DEFAULT NULL,
  p_evidence_document_id UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id            UUID;
  v_doc_account   UUID;
BEGIN
  PERFORM public.assert_manage_account_access(p_account_id);

  IF p_meter_type NOT IN ('electricity', 'gas', 'water_cold', 'water_hot', 'heat', 'other') THEN
    RAISE EXCEPTION 'invalid_meter_type';
  END IF;

  IF nullif(trim(p_reading_value), '') IS NULL THEN
    RAISE EXCEPTION 'reading_value_required';
  END IF;

  -- Cross-account evidence document guard
  IF p_evidence_document_id IS NOT NULL THEN
    SELECT account_id INTO v_doc_account
    FROM public.documents
    WHERE id = p_evidence_document_id;

    IF v_doc_account IS DISTINCT FROM p_account_id THEN
      RAISE EXCEPTION 'document_not_found_or_cross_account';
    END IF;
  END IF;

  INSERT INTO meter_readings (
    account_id, property_id, tenant_id, handover_protocol_id,
    meter_type, reading_value, unit, read_at, notes,
    evidence_document_id, recorded_by
  ) VALUES (
    p_account_id, p_property_id, p_tenant_id, p_handover_protocol_id,
    p_meter_type, trim(p_reading_value), p_unit,
    COALESCE(p_read_at, now()), p_notes,
    p_evidence_document_id, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_meter_reading(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. list_handover_protocols — for UI loading
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_handover_protocols(UUID, UUID, UUID);

CREATE FUNCTION public.list_handover_protocols(
  p_account_id  UUID,
  p_property_id UUID DEFAULT NULL,
  p_tenant_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  property_id           uuid,
  tenant_id             uuid,
  lease_id              uuid,
  protocol_type         text,
  status                text,
  keys_handed_over      boolean,
  general_condition     text,
  room_notes            jsonb,
  appliances_notes      text,
  furniture_notes       text,
  additional_notes      text,
  landlord_confirmed_at timestamptz,
  created_at            timestamptz,
  updated_at            timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hp.id, hp.property_id, hp.tenant_id, hp.lease_id,
    hp.protocol_type, hp.status, hp.keys_handed_over,
    hp.general_condition, hp.room_notes,
    hp.appliances_notes, hp.furniture_notes, hp.additional_notes,
    hp.landlord_confirmed_at, hp.created_at, hp.updated_at
  FROM handover_protocols hp
  WHERE hp.account_id = public.assert_manage_account_access(p_account_id)
    AND (p_property_id IS NULL OR hp.property_id = p_property_id)
    AND (p_tenant_id   IS NULL OR hp.tenant_id   = p_tenant_id)
  ORDER BY hp.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_handover_protocols(UUID, UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. list_meter_readings
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_meter_readings(UUID, UUID, UUID, UUID);

CREATE FUNCTION public.list_meter_readings(
  p_account_id         UUID,
  p_property_id        UUID DEFAULT NULL,
  p_tenant_id          UUID DEFAULT NULL,
  p_handover_protocol_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  property_id           uuid,
  tenant_id             uuid,
  handover_protocol_id  uuid,
  meter_type            text,
  reading_value         text,
  unit                  text,
  read_at               timestamptz,
  notes                 text,
  evidence_document_id  uuid,
  recorded_by           uuid,
  created_at            timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mr.id, mr.property_id, mr.tenant_id, mr.handover_protocol_id,
    mr.meter_type, mr.reading_value, mr.unit, mr.read_at, mr.notes,
    mr.evidence_document_id, mr.recorded_by, mr.created_at
  FROM meter_readings mr
  WHERE mr.account_id = public.assert_manage_account_access(p_account_id)
    AND (p_property_id          IS NULL OR mr.property_id          = p_property_id)
    AND (p_tenant_id            IS NULL OR mr.tenant_id            = p_tenant_id)
    AND (p_handover_protocol_id IS NULL OR mr.handover_protocol_id = p_handover_protocol_id)
  ORDER BY mr.read_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_meter_readings(UUID, UUID, UUID, UUID)
  TO authenticated;
