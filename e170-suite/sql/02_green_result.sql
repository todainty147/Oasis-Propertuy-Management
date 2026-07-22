-- E-170 GREEN result documentation query.
--
-- Run this against the integration DB AFTER applying the post-fix function
-- (supabase/finance_snapshot.sql working tree) to confirm phantoms eliminated.
--
-- Expected: Alice and Bob both show balance_state = 'unknown_payment_history',
-- remaining = 0, payment_status = 'unknown'.
-- Evidence tag: EXECUTED_INTEGRATION_DB (see e170-suite/EVIDENCE_REPORT.md)

SELECT
  p ->> 'address'       AS address,
  p ->> 'paymentStatus' AS payment_status,
  (p ->> 'remaining')::numeric AS remaining,
  p ->> 'balanceState'  AS balance_state,
  p ->> 'reasonCode'    AS reason_code,
  p ->> 'outstandingMinor' AS outstanding_minor
FROM jsonb_array_elements(
  (SELECT property_finance FROM finance_snapshot('<ACCOUNT_ID>'::uuid))
) AS p
WHERE p ->> 'address' ILIKE '%E170%'
ORDER BY p ->> 'address';

-- Confirm unknown_tenancy_count surfaced:
SELECT unknown_tenancy_count
FROM finance_snapshot('<ACCOUNT_ID>'::uuid);
