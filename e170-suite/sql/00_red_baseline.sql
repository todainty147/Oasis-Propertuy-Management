-- E-170 RED baseline documentation query.
--
-- Run this against the integration DB AFTER applying the pre-fix function
-- (git show HEAD:supabase/finance_snapshot.sql | psql) to confirm phantoms.
--
-- Expected: Alice £38,750 Overdue, Bob £28,600 Overdue.
-- These values are dynamic: months_elapsed × rent from lease_start_date to today.
-- Evidence tag: EXECUTED_INTEGRATION_DB (see e170-suite/EVIDENCE_REPORT.md)

SELECT
  p ->> 'address'       AS address,
  p ->> 'paymentStatus' AS payment_status,
  (p ->> 'remaining')::numeric AS remaining,
  p ->> 'balanceState'  AS balance_state,
  p ->> 'reasonCode'    AS reason_code
FROM jsonb_array_elements(
  (SELECT property_finance FROM finance_snapshot('<ACCOUNT_ID>'::uuid))
) AS p
WHERE p ->> 'address' ILIKE '%E170%'
   OR (p ->> 'remaining')::numeric > 10000
ORDER BY (p ->> 'remaining')::numeric DESC;
