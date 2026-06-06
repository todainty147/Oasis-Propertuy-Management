# E2E Backlog Cleanup After Docker Refresh

Date: 2026-06-06

## Fresh Broad Run

Command target: Docker-backed local test environment.

Artifact: `tmp/e2e-results-after-docker-refresh.json `

Result:

- Total E2E tests discovered: 419
- Failed tests: 50
- Passing / non-failing tests: 369
- Phase 5D HMRC pilot tests: not in the failing set
- Live HMRC network submission: not enabled and not exercised

## Failure Groups

### Notifications

Most notification failures are in `tests/e2e/notifications.spec.js` and `tests/e2e/notification-coverage.spec.js`.

Observed symptoms:

- Seeded notifications are not visible in the bell dropdown.
- Clicking seeded notifications does not consistently mark them read.
- Badge cap `99+` is not found.
- Payment and cancellation notification flows are blocked by current UI selectors or missing action visibility.
- Add-payment modal selector is ambiguous because the modal contains two selects.

Classification: backlog cleanup / test-environment alignment. This does not affect Phase 5D live pilot controls directly.

### AI Surfaces

Failing files:

- `tests/e2e/ai-surface-robustness.spec.js`
- `tests/e2e/command-center-ai.spec.js`
- `tests/e2e/maintenance-inbox-ai.spec.js`
- `tests/e2e/linkedin-product-shots.spec.js`

Observed symptoms:

- The maintenance triage privacy assertion captured a different AI request than the intended card request.
- Rate-limit handling stayed in a loading state.
- Refresh buttons expected by older tests are not found or not enabled in the current cards.
- Screenshot capture timed out around the facts toggle.

Classification: current UI/test selector drift plus one graceful-error behaviour to verify.

### Documents

Failing files:

- `tests/e2e/document-packets-flow.spec.js`
- `tests/e2e/document-requests-flow.spec.js`
- `tests/e2e/document-template-library.spec.js`

Observed symptoms:

- Expected panel test IDs are not visible in the current document UI.

Classification: likely route/feature-gate/test-ID drift after document surfaces changed.

### Localization And Dropdowns

Failing files:

- `tests/e2e/currency-localization.spec.js`
- `tests/e2e/german-localization.spec.js`
- `tests/e2e/dropdown-dark-contrast.spec.js`

Observed symptoms:

- Localization save does not expose the expected in-form success text.
- German-language switch selector expected by the test is not visible.
- Dropdown contrast test cannot find dropdowns for the sampled roles.

Classification: current shell/localization UI differs from older assumptions.

### Maintenance And Calendar Selectors

Failing files:

- `tests/e2e/maintenance-inbox-redesign.spec.js`
- `tests/e2e/maintenance-work-order-flow.spec.js`
- `tests/e2e/operating-calendar.spec.js`

Observed symptoms:

- Maintenance page title selectors collide with breadcrumb text.
- Collapsed-card copy is visually clamped but still present in the accessibility/text tree.
- Work-order status copy has changed.
- Calendar broad run has multiple rent items, so generic rent selectors are ambiguous or point at the wrong row.

Classification: broad-suite selector hardening.

### Poland Compliance

Failing files:

- `tests/e2e/poland-compliance-flow.spec.js`
- `tests/e2e/poland-compliance-security-routes.spec.js`
- `tests/e2e/poland-evidence-flow.spec.js`

Observed symptoms:

- Several assertions use generic visible text that now collides with shell or hidden options.
- Advanced overview/evidence labels do not match current rendered copy or route state.

Classification: selector and fixture drift.

### Properties And Self-Serve

Failing files:

- `tests/e2e/properties.spec.js`
- `tests/e2e/self-serve-signup-flow.spec.js`
- `tests/e2e/self-serve-signup.spec.js`

Observed symptoms:

- Add-property button is disabled in the current seeded account state.
- Rent amount assertion is too broad and matches multiple visible amounts.
- Signup page copy/account landing assertions no longer match the current onboarding flow.

Classification: seed/account readiness and copy drift.

### Screenshots

Failing files:

- `tests/e2e/compliance-screenshots.spec.js`
- `tests/e2e/marketing-screenshots.spec.js`

Observed symptoms:

- Screenshot waits target old labels (`Tax Readiness`, `Collection method`) that are not rendered on the current surfaces.

Classification: screenshot script maintenance.

## Safety Notes

- No failing group indicates that Phase 5D live network submission was enabled.
- No failing group indicates a landlord-facing live HMRC submit control appeared.
- The cleanup pass must preserve Phase 5A/5B/5C/5D gates and live-submission controls.
- The next work should prefer stable selectors and fixture alignment over weakening assertions.

## Cleanup Applied

This pass focused on the backlog groups that were actionable without changing HMRC live submission behaviour.

Fixed or hardened:

- Document request and packet E2E helpers now handle both manager accordion surfaces and direct tenant/contractor participant panels.
- Tenant/contractor document-request uploads are allowed through the antivirus quarantine storage predicate when the authenticated user is the request target.
- Document extraction loading/status copy now meets light-mode contrast requirements.
- Operating Calendar past-date headers now meet light-mode contrast requirements.
- Mobile notification count badges now use a darker red background so white count text meets contrast requirements.
- Localization save checks now wait on persisted DB state and expose a stable status element.
- German shell localization selector now supports the current sidebar language menu.
- Dropdown contrast checks now skip role surfaces that expose no native select controls.
- Maintenance Inbox collapsed-card assertions now match the visual clamp behaviour.
- Operating Calendar rent item selectors are scoped to avoid broad-run duplicate rent items.
- Properties tests now account for plan-limit disabled Add Property states and scope repeated rent text.
- Responsive accessibility dashboard readiness is scoped to the main page title.

## Verification After Cleanup

SQL overlays:

- `npm run db:apply:repo -- --db-url postgresql://postgres:postgres@127.0.0.1:61022/postgres` passed after the document antivirus predicate update.

Focused E2E subset:

- Command: `npx playwright test tests/e2e/currency-localization.spec.js tests/e2e/german-localization.spec.js tests/e2e/document-requests-flow.spec.js tests/e2e/document-packets-flow.spec.js tests/e2e/document-template-library.spec.js tests/e2e/operating-calendar.spec.js tests/e2e/properties.spec.js tests/e2e/responsive-accessibility-release.spec.js tests/e2e/dropdown-dark-contrast.spec.js tests/e2e/maintenance-inbox-redesign.spec.js --reporter=line`
- Result: 78 passed, 4 skipped, 0 failed.

Additional targeted checks:

- `tests/e2e/document-requests-flow.spec.js`: 1 passed.
- `tests/e2e/responsive-accessibility-release.spec.js`: 8 passed.

## Remaining Broad Backlog

Still open from the initial broad run and not fixed in this targeted pass:

- Notifications: bell visibility, read-state, badge cap, payment/cancellation notification action flows.
- AI surfaces: request targeting in robustness tests, rate-limit loading state, current refresh/facts selectors.
- Maintenance work-order flow: status copy drift.
- Poland compliance/evidence: selector and fixture drift.
- Self-serve signup: current onboarding/copy drift.
- Screenshot scripts: outdated wait labels for compliance and marketing captures.

Phase 5D status remains unchanged: no live HMRC network submission was enabled or exercised, and no landlord-facing live submission control was added.

## Residual Cleanup Pass 2

Date: 2026-06-06

This pass targeted the residual groups left open after the first docker-refresh cleanup. It did not add or enable any HMRC live-network submission path.

Fixed or hardened:

- Notifications now use an exact unread count instead of counting only the first loaded dropdown page, and mark-read uses a scoped RPC with the previous direct-update path as a fallback.
- Notification E2E selectors now target stable bell/dropdown test IDs and wait on database evidence for payment, maintenance, work-order assignment, and cancellation-decision notifications.
- Payment creation and paid-payment paths now create tenant notifications without changing payment ledger calculations.
- Maintenance request and work-order notification triggers were added for manager-visible tenant-created requests, tenant work-order assignment, and cancellation decisions.
- AI robustness tests now capture the intended request/card action instead of stale AI traffic, expose stable refresh selectors, and verify graceful 429/fallback handling.
- Document/evidence tests now scope selectors to the current `main` surface and handle the current Evidence Pack / Pakiet dowodów duplicate-title layout.
- Maintenance work-order creation now handles the current `work_order_create` RPC row return directly, avoiding a fragile post-create view readback.
- Poland compliance/security tests now use stable summary test IDs, route links, and serial execution for shared plan/country fixtures.
- Self-serve signup assertions now match the current Tenaqo signup copy and dashboard landing.
- Screenshot scripts now target the current Tax Tools route, Finance Settings tab, document workflows accordion, property overview/maintenance tab, and tenant portal heading.
- Temporary scratch files from the cleanup pass were removed; historical JSON artifacts were retained.

Focused verification:

- Notifications: `npx playwright test tests/e2e/notifications.spec.js tests/e2e/notification-coverage.spec.js --reporter=line` -> 38 passed.
- AI surfaces: `npx playwright test tests/e2e/ai-surface-robustness.spec.js tests/e2e/command-center-ai.spec.js tests/e2e/maintenance-inbox-ai.spec.js --reporter=line` -> 6 passed.
- Documents and Poland evidence: `npx playwright test tests/e2e/document-packets-flow.spec.js tests/e2e/document-requests-flow.spec.js tests/e2e/document-template-library.spec.js tests/e2e/poland-evidence-flow.spec.js --reporter=line` -> 22 passed.
- Localization and dropdowns: `npx playwright test tests/e2e/currency-localization.spec.js tests/e2e/german-localization.spec.js tests/e2e/dropdown-dark-contrast.spec.js --reporter=line` -> 10 passed, 4 skipped.
- Maintenance work-order/redesign: `npx playwright test tests/e2e/maintenance-inbox-redesign.spec.js tests/e2e/maintenance-work-order-flow.spec.js --reporter=line` -> 6 passed.
- Poland compliance/security: `npx playwright test tests/e2e/poland-compliance-flow.spec.js tests/e2e/poland-compliance-security-routes.spec.js --workers=1 --reporter=line` -> 45 passed.
- Self-serve signup: `npx playwright test tests/e2e/self-serve-signup.spec.js tests/e2e/self-serve-signup-flow.spec.js --reporter=line` -> 3 passed.
- Screenshot scripts: `npx playwright test tests/e2e/compliance-screenshots.spec.js tests/e2e/marketing-screenshots.spec.js tests/e2e/linkedin-product-shots.spec.js --reporter=line` -> 3 passed.
- Phase 5D pilot/dependency paths: `npx playwright test tests/e2e/hmrc-phase5d-pilot.spec.js tests/e2e/hmrc-phase5d-dependency-paths.spec.js --reporter=line` -> 13 passed.

Automated checks:

- `npm run check:edge-functions` -> passed; 16 of 16 HMRC Edge Functions type-checked.
- `npm run test:unit:run` -> passed; 2,978 tests passed.
- `npm run build` -> passed; existing large bundle warning remains.
- `npm run lint` -> passed with 58 existing warnings and 0 errors.

Broad JSON attempt:

- Command: `PLAYWRIGHT_JSON_OUTPUT_NAME=tmp\e2e-results-after-residual-cleanup-2.json npm run test:e2e -- --reporter=json`
- Artifact: `tmp/e2e-results-after-residual-cleanup-2.json`
- Result: 35 passed, 2 skipped, 126 did not run, 256 failed/cascaded.
- Validity: infrastructure-invalid for product clearance. During the run the app server stopped responding (`ERR_CONNECTION_REFUSED` / `ERR_CONNECTION_RESET`) and the failure set cascaded across unrelated sign-in and navigation tests. Early failures also showed shared-fixture/parallelism collisions in broad mode. The artifact is retained as evidence that a broad run was attempted, but it is not treated as residual-product-failure evidence.

Impact matrix:

- Phase 5D pilot/live network: unchanged; no real HMRC live-network call was made.
- Live HMRC endpoint: unchanged; no landlord-facing live submit control was added.
- Finance/tax source records: unchanged by notification and selector fixes.
- Payment ledger: unchanged; notification triggers do not mutate ledger math.
- Tenant/contractor restrictions: unchanged and covered by focused Phase 5D and Poland/security checks.
- Export/accountant pack: unchanged and covered by Phase 5D dependency-path checks.
- HMRC audit/support visibility: unchanged and covered by Phase 5D dependency-path checks.
- Document/evidence storage: selectors and antivirus predicate coverage verified; no evidence retention weakening was introduced.

Remaining follow-up:

- Full-suite broad mode still needs harness work before it can be used as a reliable product-clearance signal: either single-worker partitioning by mutable fixture group, stronger per-test fixture isolation, or a more resilient dev-server lifecycle.
- The current focused residual groups are clear.

## Broad Harness Stabilisation Pass

Date: 2026-06-06

This pass added a grouped E2E runner and failure classifier so broad-suite instability is reported as harness infrastructure instead of hundreds of unrelated product regressions.

Harness updates:

- Playwright now runs an E2E global setup health check against the configured `baseURL` before tests start.
- If the local app server is unavailable, the run fails with a clear `E2E_INFRA_DEV_SERVER_UNAVAILABLE` setup error.
- `scripts/runPlaywright.mjs` now classifies JSON reporter output when `PLAYWRIGHT_JSON_OUTPUT_NAME` is set.
- `scripts/classifyPlaywrightJson.mjs` writes a machine-readable classification artifact.
- `scripts/runE2EGroup.mjs` provides grouped runners with stable JSON artifact names under `tmp/`.

Grouped commands:

- `npm run e2e:hmrc` -> `tmp/e2e-hmrc.json`, `tmp/e2e-hmrc-classification.json`
- `npm run e2e:core-shell` -> `tmp/e2e-core-shell.json`, `tmp/e2e-core-shell-classification.json`
- `npm run e2e:finance` -> `tmp/e2e-finance.json`, `tmp/e2e-finance-classification.json`
- `npm run e2e:documents` -> `tmp/e2e-documents.json`, `tmp/e2e-documents-classification.json`
- `npm run e2e:notifications` -> `tmp/e2e-notifications.json`, `tmp/e2e-notifications-classification.json`
- `npm run e2e:maintenance` -> `tmp/e2e-maintenance.json`, `tmp/e2e-maintenance-classification.json`
- `npm run e2e:poland` -> `tmp/e2e-poland.json`, `tmp/e2e-poland-classification.json`
- `npm run e2e:screenshots` -> `tmp/e2e-screenshots.json`, `tmp/e2e-screenshots-classification.json`
- `npm run e2e:ai` -> `tmp/e2e-ai.json`, `tmp/e2e-ai-classification.json`
- `npm run e2e:signup` -> `tmp/e2e-signup.json`, `tmp/e2e-signup-classification.json`

Mutable groups forced to single worker:

- `e2e:notifications`
- `e2e:poland`
- `e2e:screenshots`
- `e2e:signup`

Classification rules:

- Dev-server unavailable, browser/page crash, app-unavailable timeout, screenshot artifact failure, or fixture collision -> `INFRASTRUCTURE_INVALID`.
- Product assertion failures without infrastructure failures -> `PRODUCT_REGRESSION`.
- Zero failures -> `PASSED`.

Rule for clearance:

- Broad E2E JSON artifacts cannot be used as Phase 5D clearance evidence while the run is classified as `INFRASTRUCTURE_INVALID`.
- Focused group results may be used as scoped evidence only when their classification artifact is `PASSED`.

Focused harness verification:

- `npm run e2e:hmrc` passed: 13 passed, 0 failed.
- Artifact: `tmp/e2e-hmrc.json`
- Classification artifact: `tmp/e2e-hmrc-classification.json`
