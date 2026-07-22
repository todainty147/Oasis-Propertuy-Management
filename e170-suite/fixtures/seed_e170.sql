-- E-170 fixture seed SQL (documentation).
--
-- The integration tests in e170-suite/integration/ create and destroy their
-- own fixtures via the harness (_harness.js createE170Property / insertLease).
-- This file documents the equivalent SQL for manual inspection.
--
-- Alice fixture: imported tenancy, renewal_status='active' (DB default),
--   lease_end_date in past → demonstrates E-172 bug (is_tenancy_ended = false).
-- Bob fixture: imported tenancy, open-ended, renewal_status='active' (DB default).
--
-- Replace <ACCOUNT_ID> and <OWNER_USER_ID> before running manually.

-- ── Alice ─────────────────────────────────────────────────────────────────────

INSERT INTO public.properties (id, owner_id, account_id, address, city, rent, status)
VALUES (
  gen_random_uuid(),
  '<OWNER_USER_ID>'::uuid,
  '<ACCOUNT_ID>'::uuid,
  'E170 Alice - 10 High Street',
  'TestCity',
  1250,
  'Wynajęte'
);

-- (capture the property id, then:)
INSERT INTO public.tenants (id, owner_id, account_id, property_id, name, email, phone, status)
VALUES (
  gen_random_uuid(),
  '<OWNER_USER_ID>'::uuid,
  '<ACCOUNT_ID>'::uuid,
  '<ALICE_PROP_ID>'::uuid,
  'E170 Alice',
  'e170.alice@test.invalid',
  '+447700000001',
  'active'
);

INSERT INTO public.leases (id, account_id, property_id, tenant_id, lease_start_date, lease_end_date, renewal_status)
VALUES (
  gen_random_uuid(),
  '<ACCOUNT_ID>'::uuid,
  '<ALICE_PROP_ID>'::uuid,
  '<ALICE_TENANT_ID>'::uuid,
  '2024-01-01',
  '2024-12-31',
  'active'  -- DB default on import (the E-172 bug)
);

-- ── Bob ───────────────────────────────────────────────────────────────────────

INSERT INTO public.properties (id, owner_id, account_id, address, city, rent, status)
VALUES (
  gen_random_uuid(),
  '<OWNER_USER_ID>'::uuid,
  '<ACCOUNT_ID>'::uuid,
  'E170 Bob - 20 The Elms Road',
  'TestCity',
  1100,
  'Wynajęte'
);

INSERT INTO public.tenants (id, owner_id, account_id, property_id, name, email, phone, status)
VALUES (
  gen_random_uuid(),
  '<OWNER_USER_ID>'::uuid,
  '<ACCOUNT_ID>'::uuid,
  '<BOB_PROP_ID>'::uuid,
  'E170 Bob',
  'e170.bob@test.invalid',
  '+447700000002',
  'active'
);

INSERT INTO public.leases (id, account_id, property_id, tenant_id, lease_start_date, lease_end_date, renewal_status)
VALUES (
  gen_random_uuid(),
  '<ACCOUNT_ID>'::uuid,
  '<BOB_PROP_ID>'::uuid,
  '<BOB_TENANT_ID>'::uuid,
  '2024-06-01',
  NULL,          -- open-ended, no end date
  'active'       -- DB default on import
);
