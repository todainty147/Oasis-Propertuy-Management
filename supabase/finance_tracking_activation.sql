-- ── P0-D/E: Tenancy Finance Activation ────────────────────────────────────────
-- Stores the user-attested opening position for per-property finance tracking.
-- This is the ONLY authoritative source for coverage_start (P0-B / Fix 2).
--
-- A numeric balance may be shown only when:
--   1. An active activation record exists (boundary is set),
--   2. An opening balance has been declared (even if £0), AND
--   3. The user has attested that all rent payments from the boundary onward
--      will be recorded in Tenaqo.
--
-- Without this record, finance_snapshot returns state='unknown_payment_history'.
-- Recording or importing transactions NEVER automatically creates this record.
-- The record is always written by an explicit user action.
-- =============================================================================

-- ── §1  Activation table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenancy_finance_activations (
  id                               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                       uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  property_id                      uuid        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- Date from which Tenaqo has complete coverage. Must not be in the future.
  coverage_start                   date        NOT NULL,
  -- What was owed (positive) or held in credit (negative) at coverage_start.
  -- Declared by the landlord; not computed by Tenaqo. Signed integer, minor units.
  opening_balance_minor            integer     NOT NULL DEFAULT 0,
  opening_position_note            text,
  -- The landlord's explicit attestation that all rent payments from coverage_start
  -- onward will be recorded in Tenaqo. Required — must be true to activate.
  attests_prospective_completeness boolean     NOT NULL,
  basis                            text        NOT NULL DEFAULT 'user_attested_opening_balance',
  activated_by                     uuid,
  activated_at                     timestamptz NOT NULL DEFAULT now(),
  -- 'active' = current activation. 'superseded' = replaced by a later activation.
  status                           text        NOT NULL DEFAULT 'active',

  CONSTRAINT tfa_basis_check
    CHECK (basis IN ('user_attested_opening_balance', 'fully_reconciled_history')),
  CONSTRAINT tfa_status_check
    CHECK (status IN ('active', 'superseded')),
  -- Prospective-completeness must be explicitly attested; no silent activation.
  CONSTRAINT tfa_completeness_required
    CHECK (status = 'superseded' OR attests_prospective_completeness = true),
  -- Boundary must not be in the future (checked in RPC too, belt-and-suspenders).
  CONSTRAINT tfa_coverage_start_not_future
    CHECK (coverage_start <= activated_at::date)
);

-- Exactly one active activation per property (enforce via partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS tfa_account_property_active_idx
  ON public.tenancy_finance_activations (account_id, property_id)
  WHERE status = 'active';

COMMENT ON TABLE public.tenancy_finance_activations IS
  'Per-property finance-tracking activation records. Stores the user-attested '
  'opening position (boundary date + opening balance + prospective-completeness '
  'attestation) required before a numeric outstanding balance may be shown. '
  'Created atomically — boundary, opening position, and attestation are written '
  'together or not at all. Part of P0 finance-epistemology correction.';

-- ── §2  RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.tenancy_finance_activations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tfa_select_account_members ON public.tenancy_finance_activations;
CREATE POLICY tfa_select_account_members
  ON public.tenancy_finance_activations
  FOR SELECT TO authenticated
  USING (public.user_can_manage_account(account_id));

REVOKE ALL ON TABLE public.tenancy_finance_activations FROM public, anon;
GRANT SELECT ON TABLE public.tenancy_finance_activations TO authenticated;

-- ── §3  RPC: activate_tenancy_finance_tracking ───────────────────────────────
--
-- Atomically writes boundary + opening position + attestation.
-- Supersedes any previous active activation for the same property.
-- Validates: account membership, completeness attestation, boundary date.
-- Returns the new activation record id.

DROP FUNCTION IF EXISTS public.activate_tenancy_finance_tracking(uuid, uuid, date, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.activate_tenancy_finance_tracking(
  p_account_id                       uuid,
  p_property_id                      uuid,
  p_coverage_start                   date,
  p_opening_balance_minor            integer DEFAULT 0,
  p_attests_prospective_completeness boolean DEFAULT NULL,
  p_note                             text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.user_can_manage_account(p_account_id) THEN
    RAISE EXCEPTION 'permission denied — activate_tenancy_finance_tracking';
  END IF;

  IF p_attests_prospective_completeness IS NOT TRUE THEN
    RAISE EXCEPTION
      'activation requires explicit prospective-completeness attestation '
      '(p_attests_prospective_completeness must be true)';
  END IF;

  IF p_coverage_start > current_date THEN
    RAISE EXCEPTION
      'coverage_start may not be in the future: %. '
      'Use the current date or an earlier confirmed start date.', p_coverage_start;
  END IF;

  -- Supersede any existing active activation for this property.
  UPDATE public.tenancy_finance_activations
  SET    status = 'superseded'
  WHERE  account_id  = p_account_id
    AND  property_id = p_property_id
    AND  status      = 'active';

  -- Write the new activation atomically.
  INSERT INTO public.tenancy_finance_activations (
    account_id, property_id, coverage_start,
    opening_balance_minor, opening_position_note,
    attests_prospective_completeness, basis,
    activated_by, status
  ) VALUES (
    p_account_id, p_property_id, p_coverage_start,
    COALESCE(p_opening_balance_minor, 0), p_note,
    TRUE, 'user_attested_opening_balance',
    auth.uid(), 'active'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_tenancy_finance_tracking(uuid, uuid, date, integer, boolean, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.activate_tenancy_finance_tracking(uuid, uuid, date, integer, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.activate_tenancy_finance_tracking(uuid, uuid, date, integer, boolean, text) IS
  'Atomically write a finance-tracking activation for a property. '
  'Requires explicit prospective-completeness attestation. '
  'Supersedes any prior active activation for the same property. '
  'Part of P0-E.';

-- ── §4  RPC: get_finance_coverage_state ──────────────────────────────────────
--
-- Returns the FinanceCoverageState for a specific property.
-- Used by the activation UI to decide what to show and what prompt to offer.
-- Returns a JSONB matching the FinanceCoverageState discriminated union in
-- src/types/finance.js.

DROP FUNCTION IF EXISTS public.get_finance_coverage_state(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_finance_coverage_state(
  p_account_id  uuid,
  p_property_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation    record;
  v_has_payments  boolean;
BEGIN
  IF NOT public.user_can_manage_account(p_account_id) THEN
    RAISE EXCEPTION 'permission denied — get_finance_coverage_state';
  END IF;

  SELECT *
  INTO   v_activation
  FROM   public.tenancy_finance_activations
  WHERE  account_id  = p_account_id
    AND  property_id = p_property_id
    AND  status      = 'active'
  LIMIT  1;

  IF v_activation.id IS NOT NULL THEN
    -- Active activation exists — determine prospectively_tracked vs fully_reconciled.
    IF v_activation.basis = 'fully_reconciled_history' THEN
      RETURN jsonb_build_object(
        'state',         'fully_reconciled',
        'coverageStart', v_activation.coverage_start::text
      );
    ELSE
      RETURN jsonb_build_object(
        'state',                'prospectively_tracked',
        'coverageStart',        v_activation.coverage_start::text,
        'openingPositionBasis', v_activation.basis,
        'openingBalanceMinor',  v_activation.opening_balance_minor
      );
    END IF;
  END IF;

  -- No activation — check for payment records to distinguish reason codes.
  SELECT EXISTS (
    SELECT 1
    FROM   public.payments p
    WHERE  p.account_id  = p_account_id
      AND  p.property_id = p_property_id
      AND  p.status NOT IN ('void', 'deleted')
    LIMIT  1
  ) INTO v_has_payments;

  IF v_has_payments THEN
    RETURN jsonb_build_object(
      'state',      'history_unknown',
      'reasonCode', 'PAYMENT_HISTORY_INCOMPLETE'
    );
  ELSE
    RETURN jsonb_build_object(
      'state',      'not_configured',
      'reasonCode', 'FINANCE_COVERAGE_START_UNKNOWN'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_coverage_state(uuid, uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_coverage_state(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_finance_coverage_state(uuid, uuid) IS
  'Returns FinanceCoverageState JSONB for a property (see src/types/finance.js). '
  'Used by the activation UI and the Finance page to decide what state to display '
  'and whether to show the "Set up finance tracking" prompt. Part of P0-C/E.';
