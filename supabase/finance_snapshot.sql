-- ── Finance Snapshot RPC ──────────────────────────────────────────────────────
--
-- P0 finance-epistemology corrections applied here:
--
--   Fix 1 (P0-A): Accrual capped at min(today, lease_end_date) for each property.
--                 An ended lease generates no new obligations past its end date.
--
--   Fix 2 (P0-B): Coverage start comes ONLY from tenancy_finance_activations.
--                 lease_start, first-payment date, import date, created_at are
--                 all PROHIBITED as proxies. Without an activation record the
--                 balance state is 'unknown_payment_history' (never a computed £0).
--
--   Fix 4/5 (P0-C): Every per-property result is a typed BalanceResult:
--                   state in ('known', 'unknown_payment_history', 'not_started').
--                   Two precise bases; supported_projection is removed.
--                   Headline totals exclude unknowns; unknown_tenancy_count surfaced.
--
-- Depends on: finance_tracking_activation.sql (tenancy_finance_activations table)
-- =============================================================================

DROP FUNCTION IF EXISTS public.finance_snapshot(uuid, uuid);

CREATE OR REPLACE FUNCTION public.finance_snapshot(
  p_account_id uuid,
  p_tenant_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  total_income          numeric,
  overdue_income        numeric,
  due_soon_income       numeric,
  outstanding_income    numeric,    -- only 'known' balances; unknowns excluded
  unknown_tenancy_count integer,    -- occupied properties without a known balance
  property_finance      jsonb,
  account_currency      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id        uuid;
  v_account_currency text;
BEGIN
  v_tenant_id := public.assert_tenant_scope_access(p_account_id, p_tenant_id);

  SELECT coalesce(a.currency, 'PLN') INTO v_account_currency
  FROM public.accounts a
  WHERE a.id = p_account_id;

  RETURN QUERY
  WITH

  -- ── Scope ─────────────────────────────────────────────────────────────────

  tenant_scope AS (
    SELECT t.property_id
    FROM public.tenants t
    WHERE t.id = v_tenant_id
      AND t.account_id = p_account_id
    LIMIT 1
  ),

  scoped_properties AS (
    SELECT
      pr.id,
      pr.address,
      pr.city,
      pr.tenant_id,
      COALESCE(pr.rent, 0) AS rent
    FROM properties pr
    WHERE pr.account_id = p_account_id
      AND (
        v_tenant_id IS NULL
        OR pr.id = (SELECT property_id FROM tenant_scope)
      )
  ),

  property_occupancy AS (
    SELECT
      sp.id AS property_id,
      (
        sp.tenant_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.tenants t
          WHERE t.account_id = p_account_id
            AND t.property_id = sp.id
            AND t.archived_at IS NULL
        )
      ) AS has_assigned_tenant
    FROM scoped_properties sp
  ),

  scoped_payments AS (
    SELECT
      p.id,
      p.property_id,
      p.tenant_id,
      COALESCE(p.amount, 0) AS amount,
      LOWER(COALESCE(p.status, '')) AS status_norm,
      p.paid_at,
      p.due_date
    FROM payments p
    WHERE p.account_id = p_account_id
      AND (
        v_tenant_id IS NULL
        OR p.tenant_id = v_tenant_id
      )
  ),

  payment_rows AS (
    SELECT
      sp.id,
      sp.property_id,
      sp.tenant_id,
      sp.amount,
      sp.status_norm,
      sp.paid_at,
      sp.due_date,
      (
        sp.paid_at IS NOT NULL
        OR sp.status_norm IN ('paid', 'oplacone', 'opłacone')
      ) AS is_paid,
      DATE_TRUNC(
        'month',
        COALESCE(sp.due_date::timestamp, sp.paid_at::timestamp, CURRENT_DATE::timestamp)
      ) AS cycle_month
    FROM scoped_payments sp
  ),

  payment_cycles AS (
    SELECT
      prx.property_id,
      prx.tenant_id,
      prx.cycle_month,
      GREATEST(
        COALESCE(MAX(pr.rent), 0),
        COALESCE(MAX(prx.amount), 0)
      ) AS billed_amount,
      COALESCE(
        SUM(CASE WHEN prx.is_paid THEN prx.amount ELSE 0 END),
        0
      ) AS paid_amount,
      MIN(CASE WHEN NOT prx.is_paid THEN prx.due_date ELSE NULL END) AS open_due_date,
      COALESCE(
        BOOL_OR(
          NOT prx.is_paid
          AND (
            prx.status_norm IN ('overdue', 'zalegle', 'zaległe')
            OR (prx.due_date IS NOT NULL AND prx.due_date < CURRENT_DATE)
          )
        ),
        FALSE
      ) AS has_overdue
    FROM payment_rows prx
    LEFT JOIN scoped_properties pr ON pr.id = prx.property_id
    GROUP BY prx.property_id, prx.tenant_id, prx.cycle_month
  ),

  -- ── Fix 2: Activation records (P0-B) ──────────────────────────────────────
  --
  -- The ONLY authoritative source for coverage_start.
  -- lease_start, first-payment date, import date, created_at are prohibited proxies.

  property_activation AS (
    SELECT
      sp.id          AS property_id,
      tfa.id         AS activation_id,
      tfa.coverage_start,
      tfa.opening_balance_minor,
      tfa.basis      AS activation_basis
    FROM scoped_properties sp
    LEFT JOIN public.tenancy_finance_activations tfa
      ON  tfa.account_id  = p_account_id
      AND tfa.property_id = sp.id
      AND tfa.status      = 'active'
  ),

  -- ── Fix 1: Lease end date for accrual cap (P0-A) — Gate 1 amended ──────────
  --
  -- Active tenancy (at least one non-ended lease row): use the most recent
  -- non-ended lease's end_date. NULL = open-ended → accrue to today.
  --
  -- Ended tenancy (all leases have renewal_status='ended'): use the most recent
  -- lease's end_date so accrual stops at the evidenced close, not CURRENT_DATE.
  -- Pre-fix, the ELSE branch was absent; COALESCE fell through to CURRENT_DATE
  -- for ended tenancies (Gate 1 defect, E-170 owned — see EVIDENCE_REPORT.md).

  property_lease_end AS (
    SELECT
      sp.id AS property_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.leases l
          WHERE l.account_id  = p_account_id
            AND l.property_id = sp.id
            AND LOWER(COALESCE(l.renewal_status, 'active')) NOT IN ('ended')
        )
        -- Active tenancy: most recent non-ended lease's end_date (NULL = open-ended).
        THEN (
          SELECT l.lease_end_date
          FROM public.leases l
          WHERE l.account_id  = p_account_id
            AND l.property_id = sp.id
            AND LOWER(COALESCE(l.renewal_status, 'active')) NOT IN ('ended')
          ORDER BY l.lease_start_date DESC NULLS LAST
          LIMIT 1
        )
        -- Ended tenancy: most recent lease's end_date caps accrual at evidenced close.
        ELSE (
          SELECT l.lease_end_date
          FROM public.leases l
          WHERE l.account_id  = p_account_id
            AND l.property_id = sp.id
          ORDER BY l.lease_start_date DESC NULLS LAST
          LIMIT 1
        )
      END AS lease_end_date,
      -- Whether the tenancy has an ended lease and no active continuation.
      NOT EXISTS (
        SELECT 1
        FROM public.leases l
        WHERE l.account_id  = p_account_id
          AND l.property_id = sp.id
          AND LOWER(COALESCE(l.renewal_status, 'active')) NOT IN ('ended')
      ) AS is_tenancy_ended
    FROM scoped_properties sp
  ),

  -- ── Accumulated stats per property ────────────────────────────────────────
  --
  -- Fix 1: months_elapsed caps at min(today, lease_end_date).
  -- Fix 2: months_elapsed is 0 when no activation record exists.
  -- Payments counted only from coverage_start onward (opening balance covers prior).

  property_accumulated AS (
    SELECT
      sp.id   AS property_id,
      sp.rent,
      pa.activation_id,
      pa.coverage_start,
      COALESCE(pa.opening_balance_minor, 0) AS opening_balance_minor,
      pa.activation_basis,
      ple.lease_end_date,
      ple.is_tenancy_ended,

      -- Fix 1: accrual end = min(today, lease_end); open-ended = today.
      LEAST(CURRENT_DATE, COALESCE(ple.lease_end_date, CURRENT_DATE)) AS accrual_end,

      -- Balance state (BalanceResult.state)
      CASE
        WHEN pa.activation_id IS NOT NULL
             AND pa.coverage_start IS NOT NULL
             AND pa.coverage_start <= CURRENT_DATE
        THEN 'known'
        WHEN pa.activation_id IS NULL
        THEN 'unknown_payment_history'
        -- activation exists but coverage_start is in future (edge case, should not occur
        -- due to RPC constraint, but handled defensively)
        ELSE 'not_started'
      END AS balance_state,

      -- Reason code when balance cannot be shown
      CASE
        WHEN pa.activation_id IS NULL THEN
          CASE
            WHEN EXISTS (
              SELECT 1 FROM payment_rows pr2
              WHERE pr2.property_id = sp.id
              LIMIT 1
            )
            THEN 'PAYMENT_HISTORY_INCOMPLETE'
            ELSE 'FINANCE_COVERAGE_START_UNKNOWN'
          END
        WHEN pa.activation_id IS NOT NULL
             AND (pa.coverage_start IS NULL OR pa.coverage_start > CURRENT_DATE)
        THEN 'TENANCY_NOT_STARTED'
        ELSE NULL
      END AS reason_code,

      -- Fix 1+2: months_elapsed from coverage_start to accrual_end (inclusive).
      -- Zero when not in 'known' state.
      CASE
        WHEN pa.activation_id IS NOT NULL
             AND pa.coverage_start IS NOT NULL
             AND pa.coverage_start <= CURRENT_DATE
             AND sp.rent > 0
        THEN GREATEST(
          (
            EXTRACT(YEAR FROM AGE(
              DATE_TRUNC('month', LEAST(CURRENT_DATE, COALESCE(ple.lease_end_date, CURRENT_DATE)))::date,
              DATE_TRUNC('month', pa.coverage_start)::date
            )) * 12
            + EXTRACT(MONTH FROM AGE(
              DATE_TRUNC('month', LEAST(CURRENT_DATE, COALESCE(ple.lease_end_date, CURRENT_DATE)))::date,
              DATE_TRUNC('month', pa.coverage_start)::date
            ))
            + 1  -- include the start month itself
          )::integer,
          1      -- minimum 1 month when activated
        )
        ELSE 0
      END AS months_elapsed,

      -- Paid since coverage_start (only payments on or after the boundary).
      -- Pre-boundary payments are captured in opening_balance_minor.
      CASE
        WHEN pa.activation_id IS NOT NULL AND pa.coverage_start IS NOT NULL
        THEN COALESCE((
          SELECT SUM(pr2.amount)
          FROM payment_rows pr2
          WHERE pr2.property_id = sp.id
            AND pr2.is_paid
            AND pr2.cycle_month >= DATE_TRUNC('month', pa.coverage_start)
        ), 0)
        ELSE 0
      END AS total_paid_since_coverage,

      -- Paid before current month since coverage_start (for overdue calculation).
      CASE
        WHEN pa.activation_id IS NOT NULL AND pa.coverage_start IS NOT NULL
        THEN COALESCE((
          SELECT SUM(pr2.amount)
          FROM payment_rows pr2
          WHERE pr2.property_id = sp.id
            AND pr2.is_paid
            AND pr2.cycle_month >= DATE_TRUNC('month', pa.coverage_start)
            AND pr2.cycle_month < DATE_TRUNC('month', CURRENT_DATE)
        ), 0)
        ELSE 0
      END AS total_paid_before_current_since_coverage

    FROM scoped_properties sp
    JOIN property_activation pa  ON pa.property_id  = sp.id
    JOIN property_lease_end  ple ON ple.property_id = sp.id
  ),

  -- ── Headline totals ───────────────────────────────────────────────────────
  --
  -- Fix 4: outstanding_income includes ONLY 'known' balances.
  -- unknown_tenancy_count surfaces the excluded count.
  -- MTD cash received includes all payments (tax reporting uses transactions).

  finance_totals AS (
    SELECT

      -- MTD cash received: all payments regardless of balance state.
      COALESCE((
        SELECT SUM(pr2.amount)
        FROM payment_rows pr2
        WHERE pr2.is_paid
          AND pr2.paid_at IS NOT NULL
          AND pr2.paid_at >= DATE_TRUNC('month', CURRENT_DATE)::date
          AND pr2.paid_at <= CURRENT_DATE
      ), 0) AS total_income,

      -- Overdue: historical arrears from 'known' balance properties only.
      COALESCE((
        SELECT SUM(GREATEST(
          (pac.months_elapsed - 1) * pac.rent
          + pac.opening_balance_minor / 100.0
          - pac.total_paid_before_current_since_coverage,
          0
        ))
        FROM property_accumulated pac
        JOIN property_occupancy po ON po.property_id = pac.property_id
        WHERE po.has_assigned_tenant
          AND pac.balance_state = 'known'
          AND pac.rent > 0
          AND pac.months_elapsed > 1
          AND pac.total_paid_before_current_since_coverage
              < (pac.months_elapsed - 1) * pac.rent + pac.opening_balance_minor / 100.0
      ), 0)
      +
      -- current-cycle balances whose due date has passed
      COALESCE((
        SELECT SUM(GREATEST(pc.billed_amount - pc.paid_amount, 0))
        FROM payment_cycles pc
        JOIN property_occupancy po  ON po.property_id  = pc.property_id
        JOIN property_accumulated pac ON pac.property_id = pc.property_id
        WHERE po.has_assigned_tenant
          AND pac.balance_state = 'known'
          AND GREATEST(pc.billed_amount - pc.paid_amount, 0) > 0
          AND pc.has_overdue
          AND pc.cycle_month >= date_trunc('month', current_date)
      ), 0) AS overdue_income,

      -- Due within 7 days: kept from payment records (unchanged).
      COALESCE((
        SELECT SUM(GREATEST(pc.billed_amount - pc.paid_amount, 0))
        FROM payment_cycles pc
        WHERE GREATEST(pc.billed_amount - pc.paid_amount, 0) > 0
          AND pc.open_due_date IS NOT NULL
          AND pc.open_due_date >= CURRENT_DATE
          AND pc.open_due_date <= CURRENT_DATE + INTERVAL '7 days'
      ), 0) AS due_soon_income,

      -- Outstanding (Total Owed): only 'known' balances.
      -- Formula: opening_balance + (months × rent) - paid since coverage_start.
      COALESCE((
        SELECT SUM(GREATEST(
          pac.opening_balance_minor / 100.0
          + pac.months_elapsed * pac.rent
          - pac.total_paid_since_coverage,
          0
        ))
        FROM property_accumulated pac
        JOIN property_occupancy po ON po.property_id = pac.property_id
        WHERE po.has_assigned_tenant
          AND pac.balance_state = 'known'
          AND pac.rent > 0
          AND pac.months_elapsed >= 1
      ), 0) AS outstanding_income,

      -- Occupied properties whose balance cannot be shown (excluded from totals).
      COALESCE((
        SELECT COUNT(*)::integer
        FROM property_accumulated pac
        JOIN property_occupancy po ON po.property_id = pac.property_id
        WHERE po.has_assigned_tenant
          AND pac.balance_state = 'unknown_payment_history'
      ), 0) AS unknown_tenancy_count

  ),

  -- ── Per-property rows ─────────────────────────────────────────────────────

  property_rows AS (
    SELECT
      sp.id           AS property_id,
      sp.address,
      sp.city,
      sp.rent,
      po.has_assigned_tenant,
      COALESCE(BOOL_OR(pc.property_id IS NOT NULL), FALSE) AS has_payment_cycle,

      pac.balance_state,
      pac.reason_code,

      -- Typed minor-unit fields (non-null only for 'known' state).
      CASE WHEN pac.balance_state = 'known' THEN
        (pac.opening_balance_minor + pac.months_elapsed * ROUND(sp.rent * 100))::integer
      END AS expected_minor,

      CASE WHEN pac.balance_state = 'known' THEN
        ROUND(pac.total_paid_since_coverage * 100)::integer
      END AS paid_minor,

      CASE WHEN pac.balance_state = 'known' THEN
        GREATEST(
          pac.opening_balance_minor
          + pac.months_elapsed * ROUND(sp.rent * 100)::integer
          - ROUND(pac.total_paid_since_coverage * 100)::integer,
          0
        )::integer
      END AS outstanding_minor,

      CASE WHEN pac.balance_state = 'known' THEN
        LEAST(CURRENT_DATE, COALESCE(pac.lease_end_date, CURRENT_DATE))::text
      END AS accrual_through,

      CASE WHEN pac.balance_state = 'known' THEN pac.coverage_start::text END AS coverage_start_text,
      CASE WHEN pac.balance_state = 'known' THEN pac.activation_basis END AS balance_basis,

      -- Legacy major-unit fields (backward compatibility for existing consumers).
      COALESCE(pac.total_paid_since_coverage, 0) AS paid,

      CASE
        WHEN (po.has_assigned_tenant OR COALESCE(BOOL_OR(pc.property_id IS NOT NULL), FALSE))
             AND sp.rent > 0
             AND pac.balance_state = 'known'
        THEN GREATEST(
          pac.opening_balance_minor / 100.0
          + pac.months_elapsed * sp.rent
          - pac.total_paid_since_coverage,
          0
        )
        ELSE 0
      END AS remaining,

      CASE
        WHEN pac.balance_state = 'known'
             AND sp.rent > 0
             AND pac.months_elapsed > 1
             AND pac.total_paid_before_current_since_coverage
                 < (pac.months_elapsed - 1) * sp.rent + pac.opening_balance_minor / 100.0
        THEN TRUE
        ELSE COALESCE(
          BOOL_OR(GREATEST(pc.billed_amount - pc.paid_amount, 0) > 0 AND pc.has_overdue),
          FALSE
        )
      END AS has_overdue_balance,

      pac.is_tenancy_ended

    FROM scoped_properties sp
    JOIN property_occupancy    po  ON po.property_id  = sp.id
    LEFT JOIN payment_cycles   pc  ON pc.property_id  = sp.id
    JOIN property_accumulated  pac ON pac.property_id = sp.id
    GROUP BY
      sp.id, sp.address, sp.city, sp.rent, po.has_assigned_tenant,
      pac.balance_state, pac.reason_code,
      pac.opening_balance_minor, pac.months_elapsed,
      pac.total_paid_since_coverage, pac.total_paid_before_current_since_coverage,
      pac.activation_basis, pac.coverage_start, pac.lease_end_date,
      pac.is_tenancy_ended
  ),

  property_status_rows AS (
    SELECT
      property_id, address, city, rent,
      paid, remaining,
      balance_state, reason_code,
      expected_minor, paid_minor, outstanding_minor,
      accrual_through, coverage_start_text, balance_basis,
      is_tenancy_ended,
      CASE
        WHEN NOT has_assigned_tenant AND NOT has_payment_cycle THEN 'vacant'
        WHEN balance_state = 'unknown_payment_history'         THEN 'unknown'
        WHEN balance_state = 'not_started'                     THEN 'not_started'
        WHEN remaining <= 0                                    THEN 'paid'
        WHEN has_overdue_balance                               THEN 'overdue'
        WHEN paid > 0                                          THEN 'partial'
        ELSE 'pending'
      END AS payment_status
    FROM property_rows
  ),

  property_json AS (
    SELECT COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          -- Legacy fields (backward compatible)
          'propertyId',    property_id,
          'address',       address,
          'city',          city,
          'rent',          rent,
          'paid',          paid,
          'remaining',     remaining,
          'paymentStatus', payment_status,
          -- Typed P0 fields
          'balanceState',    balance_state,
          'reasonCode',      reason_code,
          'outstandingMinor', outstanding_minor,
          'paidMinor',       paid_minor,
          'expectedMinor',   expected_minor,
          'accrualThrough',     accrual_through,
          'coverageStart',      coverage_start_text,
          'balanceBasis',       balance_basis,
          'isTenancyEnded',     is_tenancy_ended,
          -- Scope identifier: echoes the authenticated tenant scope used for
          -- property selection and tenant-filtered payment retrieval.
          -- NOT attribution evidence — rent, activation, opening_balance_minor
          -- and lease_end_date remain property-scoped. See ARCH-FIN-01.
          -- NULL when called without a tenant scope (landlord view).
          'scopeTenancyId',     v_tenant_id
        )
        ORDER BY address
      ),
      '[]'::jsonb
    ) AS property_finance
    FROM property_status_rows
  )

  SELECT
    finance_totals.total_income,
    finance_totals.overdue_income,
    finance_totals.due_soon_income,
    finance_totals.outstanding_income,
    finance_totals.unknown_tenancy_count,
    property_json.property_finance,
    v_account_currency
  FROM finance_totals, property_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finance_snapshot(uuid, uuid) TO authenticated;
