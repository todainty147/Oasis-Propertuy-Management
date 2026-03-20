# Local Supabase Integration Harness

This harness is the first honest step toward end-to-end RPC isolation tests.

What it assumes:
- you have a local Supabase project already running
- the local database already has the OASIS schema/RPC SQL applied
- you provide local test credentials in `.env.integration.local`

Preflight behavior:
- if local Supabase is not running, the seed script now fails with a direct connectivity message
- if the local database is missing baseline OASIS tables, the seed script reports exactly which core tables are missing

What it does:
- creates deterministic auth users by fixture email
- seeds fixed account/property/tenant/contractor/payment/request/work-order rows
- signs in as real users against the local Supabase Auth service
- allows integration tests to call real RPCs under authenticated sessions

Current file structure:
- `tests/integration/dashboard_snapshot.test.js`
- `tests/integration/finance_snapshot.test.js`
- `tests/integration/tenant_activity_feed.test.js`
- `tests/integration/command_center_items.test.js`
- `tests/integration/attention_center_items.test.js`
- `tests/integration/portfolio_attention_items.test.js`
- `tests/integration/portfolio_health_snapshot.test.js`
- `tests/integration/contractor_work_order_cards.test.js`
- `tests/integration/accept_account_invite.test.js`
- `tests/integration/inviteSecurity.test.js`
- `tests/integration/contractor_financial_workflow.test.js`
- `tests/integration/schema_regression_guards.test.js`
- `tests/integration/PERFORMANCE_REVIEW.md`
- shared harness helpers stay under `tests/integration/helpers/`

Behavior notes:
- manager-only feeds like `attention_center_items` and `command_center_items` deny tenant/contractor access
- mixed-scope feeds like `portfolio_attention_items` and `portfolio_health_snapshot` allow tenant self-scope but deny cross-tenant scope
- `contractor_work_order_cards` is intentionally contractor-filtered by `auth.uid()` and returns an empty set for non-contractors instead of throwing
- `accept_account_invite` is covered with real authenticated invite acceptance, replay, revoked, and email-mismatch scenarios
- `accept_account_invite` now rejects expired invites server-side when `expires_at` is set in the past
- invite lifecycle coverage now exercises authenticated create, revoke, eligibility, and account-scoped pending-invite visibility for standard account invitations
- contractor financial workflow coverage now exercises quote draft save, quote submit, manager reject/approve, and invoice save-after-approval with real authenticated role boundaries
- schema regression guards fail early when critical columns or seeded account/tenant/contractor/payment/work-order linkages drift under future migrations
- `tests/integration/PERFORMANCE_REVIEW.md` tracks the current performance-sensitive RPC shapes, supporting indexes, and the next index/query tightening candidates
- `docs/SECURITY_OBSERVABILITY.md` tracks how denied-path and security-sensitive failures are surfaced for staging/production diagnosis

Recommended local flow:
1. Start local Supabase.
2. Load `supabase/baseline_schema.sql` into your local database.
3. Apply additive SQL overlays that are newer than the baseline you loaded. For the current suite, make sure invite, payment authorization, and storage overlays are applied after the baseline.
4. Copy `.env.integration.example` to `.env.integration.local`.
5. Set `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, and `TEST_SUPABASE_SERVICE_ROLE_KEY`.
6. Apply the invite, payment authorization, and storage overlays if your local baseline does not already include them:

```bash
PGPASSWORD=postgres psql \
  --dbname "postgresql://postgres@127.0.0.1:54322/postgres" \
  --file "supabase/account_invitations_saas.sql"

PGPASSWORD=postgres psql \
  --dbname "postgresql://postgres@127.0.0.1:54322/postgres" \
  --file "supabase/payment_write_authorization.sql"

PGPASSWORD=postgres psql \
  --dbname "postgresql://postgres@127.0.0.1:54322/postgres" \
  --file "supabase/storage_buckets.sql"

PGPASSWORD=postgres psql \
  --dbname "postgresql://postgres@127.0.0.1:54322/postgres" \
  --file "supabase/storage_documents_policies.sql"

PGPASSWORD=postgres psql \
  --dbname "postgresql://postgres@127.0.0.1:54322/postgres" \
  --file "supabase/storage_maintenance_request_attachments_policies.sql"

PGPASSWORD=postgres psql \
  --dbname "postgresql://postgres@127.0.0.1:54322/postgres" \
  --file "supabase/storage_work_order_attachments_policies.sql"
```

7. Seed the harness:

```bash
npm run test:integration:seed
```

8. Run the integration suite:

```bash
npm run test:integration:run
```

Schema regeneration:
- the authoritative local bootstrap artifact is `supabase/baseline_schema.sql`
- refresh it from the current local authoritative database with:

```bash
npm run schema:baseline:refresh
```

- verify it has not drifted with:

```bash
npm run schema:baseline:check
```

- see [docs/SCHEMA_WORKFLOW.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SCHEMA_WORKFLOW.md) for the full baseline + overlay workflow and known limitations

Recommended day-to-day commands:
- run one integration file:

```bash
npm run test:integration:file -- tests/integration/accept_account_invite.test.js
```

- run one named test or focused subset:

```bash
npm run test:integration:name -- -t "rejects expired invites"
```

- run one file with a named subset:

```bash
npm run test:integration:file -- tests/integration/contractor_financial_workflow.test.js -t "invoice save"
```

- rerun with verbose reporting when failure output needs more context:

```bash
npm run test:integration:verbose
```

Practical workflow:
- use `npm run test:unit:run` for fast source/unit feedback
- use `npm run test:integration:file -- <path>` while iterating on one RPC or mutation
- use `npm run test:integration:name -- -t "<pattern>"` when you only need one scenario
- use `npm run test:integration:run` before pushing when you touched shared SQL, harness, or seeded auth flows

CI structure:
- fast Vitest/source tests run via `npm run test:unit:run`
- authenticated local Supabase integration tests run via `npm run test:integration:seed` and `npm run test:integration:run`
- the GitHub Actions integration lane starts a local Supabase stack, loads `supabase/baseline_schema.sql`, applies invite, payment authorization, and storage overlays, seeds the harness, and then runs the integration suite

CI env and secrets:
- the checked-in GitHub Actions workflow uses local Supabase in CI, so it does not require hosted Supabase secrets
- integration env values are populated from the local CLI stack with `supabase status -o env`
- `TEST_USER_PASSWORD` is set in the workflow for deterministic fixture auth bootstrap
- if you later move this lane to a non-local Supabase target, you will need to provide:
  - `TEST_SUPABASE_URL`
  - `TEST_SUPABASE_ANON_KEY`
  - `TEST_SUPABASE_SERVICE_ROLE_KEY`
  - `TEST_USER_PASSWORD`

Why this harness is additive:
- it does not replace the existing fast unit/source Vitest suite
- it does not invent a second fixture vocabulary
- it reuses the seeded logical identities from `tests/fixtures/isolationFixtures.js`
- it uses real authenticated Supabase clients for future deny-vs-filtered assertions
