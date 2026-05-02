# OASIS QA Test Plan

**Created:** 2026-05-01  
**Scope:** Full test coverage map for OASIS Rental Management Platform  
**Status:** Living document — update when new features ship or gaps are closed

---

## 1. Test Architecture

| Layer | Runner | Location | Runs Against |
|-------|--------|----------|--------------|
| Unit / Contract | Vitest | `tests/security/` | Mocked / in-process |
| Integration | Vitest + local Supabase | `tests/integration/` | Local Supabase harness |
| Smoke / Manual | Checklist | `docs/RELEASE_SMOKE_CHECKLIST.md` | Staging / production |

Integration tests skip automatically when `TEST_SUPABASE_URL` / `TEST_SUPABASE_SERVICE_ROLE_KEY` / `TEST_SUPABASE_ANON_KEY` are not set (via `describe.skipIf(!isIntegrationHarnessConfigured())`).

---

## 2. Test Inventory

### 2.1 Integration Tests (`tests/integration/`)

#### Account & Auth
| File | What it covers |
|------|----------------|
| `accountEntitlements.test.js` | Feature gates per plan (growth/pro/operator_agency), `assert_account_feature_access` |
| `accountMemberRoleMutation.test.js` | Role assignment, demotion, and removal via RPC |
| `accountPermissionResolution.test.js` | `user_can_manage_account`, `is_account_member` helpers |
| `accountOwnerAndSelfServeSecurity.test.js` | Owner self-service actions, account lifecycle |
| `accept_account_invite.test.js` | Invitation acceptance flow, token expiry |
| `rootAccountLifecycle.test.js` | Root account creation and bootstrap |
| `rootLandlordInvitation.test.js` | Root user inviting new landlords |
| `rootSupportImpersonation.test.js` | Root support access to non-root accounts |

#### Isolation & Cross-Account
| File | What it covers |
|------|----------------|
| `inviteSecurity.test.js` | Invitation token exposure, cross-account invite denial |
| `maintenanceRequestSecurity.test.js` | Tenant can create, non-owner cannot read across accounts |
| `workOrderWorkflowSecurity.test.js` | Work order status transitions, role enforcement |
| `workOrderAllowedActionsSecurity.test.js` | Allowed-actions matrix per role |
| `contractorUpdateWorkOrderSecurity.test.js` | Contractor restricted to assigned orders only |
| `paymentWriteSecurity.test.js` | Payment mutation: owner/staff allowed, tenant denied |
| `documentSecurity.test.js` | Document read/write isolation per account and role |

#### Compliance & Risk Suite
| File | What it covers |
|------|----------------|
| `complianceBackendSecurity.test.js` | **NEW** — `list_tax_items`, `list_rent_shield_assessments`, `list_lease_audits`, `list_lease_audit_findings` RPCs + direct table RLS |
| `complianceDocumentLinksSecurity.test.js` | Compliance document attachment isolation |
| `leaseSecurity.test.js` | Lease read/write per role |

#### Document Extraction
| File | What it covers |
|------|----------------|
| `documentExtractionSecurity.test.js` | **NEW** — All 5 extraction RPCs + direct table RLS for `document_extractions` and `document_extraction_runs` |
| `documentRequests.test.js` | Document request creation and fulfillment |
| `documentTemplates.test.js` | Template CRUD isolation |
| `documentPackets.test.js` | Packet creation and delivery |

#### Golden Workflow & Audit
| File | What it covers |
|------|----------------|
| `oasisGoldenWorkflow.test.js` | **NEW** — Tenant maintenance request → manager creates work order → contractor quotes → manager approves → contractor invoices → manager completes. Includes negative guards at each step. |
| `workOrderAuditAndNotifications.test.js` | **NEW** — `work_order_audit_log` written after status changes, correct actor/action/account, cross-account read blocked; `create_notifications` RPC: manager allowed, tenant/contractor denied, cross-account denied; notification RLS: recipient reads own rows only, no direct inserts. |
| `contractor_financial_workflow.test.js` | Legacy financial workflow (pre-`wo_fin_*` RPCs) |
| `work_order_set_status.test.js` | Status machine transitions |

#### Snapshots & Analytics
| File | What it covers |
|------|----------------|
| `dashboard_snapshot.test.js` | Dashboard snapshot RPC isolation |
| `portfolio_health_snapshot.test.js` | Portfolio health snapshot per account |
| `property_operational_health_snapshot.test.js` | Property-level snapshot isolation |
| `finance_snapshot.test.js` | Finance snapshot aggregation |
| `operationalSnapshotRpcSecurity.test.js` | All operational snapshot RPCs cross-account |

#### Other
| File | What it covers |
|------|----------------|
| `schema_regression_guards.test.js` | Critical columns and constraints still present |
| `apiRateLimits.test.js` | Rate limit RPC behavior |
| `marketplaceIntegrations.test.js` | Marketplace integration upsert/read isolation |
| `securityAuditExportSecurity.test.js` | Audit export access control |
| `customFieldsSecurity.test.js` | Custom field CRUD per role |
| `customRoleManagement.test.js` | Custom staff role assignment |
| `contractorRatingsSecurity.test.js` | Rating write access |
| `preventiveMaintenanceSecurity.test.js` | Preventive maintenance plan isolation |
| `maintenanceExpenseFactsSecurity.test.js` | Expense fact isolation |
| `operationsFoundationsSecurity.test.js` | Operations snapshot isolation |
| `security_anomaly_alert_apply.test.js` | Anomaly alert acknowledgement |

---

### 2.2 Unit / Contract Tests (`tests/security/`)

#### Localization
| File | What it covers |
|------|----------------|
| `localizationKeyContracts.test.js` | **NEW** — Key parity across pl/en/de, no empty values, 44 critical keys spot-checked |
| `notificationLocalization.test.js` | Notification content localization function |

#### Contractor Portal UI
| File | What it covers |
|------|----------------|
| `contractorPortalUiContracts.test.js` | **NEW** — Page structure (header, filter pills, no manager actions); status/priority normalization contracts; ackStateForRow logic; contractorNextStep guidance logic |

#### Tenant Portal UI (extended)
| File | What it covers |
|------|----------------|
| `tenantPortalUiContracts.test.js` | Dashboard surfaces, payment history rendering, document trust copy |
| `tenantPortalEmptyStateContracts.test.js` | **NEW** — Payment empty state (zero-row, overdue row), document empty state, no admin actions in tenant views, role boundary (no manager surfaces for tenant role) |

#### AI Feature Gate
| File | What it covers |
|------|----------------|
| `aiFeatureGateContracts.test.js` | **NEW** — Rent Shield pure-function contracts (computeShieldMetrics, computeShieldScore, classifyShieldTier, periodKeyToDateRange, currentPeriodKey); AI insight service null guards; normalized output schema validation for attention/property-health/maintenance-triage insight services; safe defaults for missing fields; error propagation from Edge Function |
| `aiSurfaceRobustnessContracts.test.js` | PII minimization, prompt injection resistance, payload size caps |
| `aiCostControlsContracts.test.js` | AI quota helpers, `get_account_ai_usage_summary` |

#### SQL / RPC Contracts
| File | What it covers |
|------|----------------|
| `rpcContracts.test.js` | RPC parameter shapes and return types |
| `rpcServiceIsolation.test.js` | Service-layer RPC isolation contracts |
| `rpcAdminSecurityContracts.test.js` | Admin-only RPC restrictions |
| `rpcAggregateServiceContracts.test.js` | Aggregate RPC contracts |
| `rpcMutationContracts.test.js` | Mutation RPC contracts |
| `rpcPerformanceContracts.test.js` | RPC index coverage |
| `databaseHardeningContracts.test.js` | Schema hardening (RLS, triggers, constraints) |
| `documentExtractionSqlContracts.test.js` | SQL structure of extraction RPCs |
| `documentExtractionServiceContracts.test.js` | Service-layer contracts for extraction |
| `complianceSuitePhase0Contracts.test.js` | Phase 0 compliance SQL structure |

#### AI Surface Contracts
| File | What it covers |
|------|----------------|
| `aiCostControlsContracts.test.js` | AI quota helpers, `get_account_ai_usage_summary` |
| `aiSurfaceRobustnessContracts.test.js` | AI feature guard paths |
| `attentionInsightService.test.js` | Attention insight AI surface |
| `propertyHealthInsightService.test.js` | Property health AI surface |
| `maintenanceTriageInsightService.test.js` | Maintenance triage AI surface |
| `contractorRecommendationService.test.js` | Contractor recommendation AI surface |
| `weeklyPortfolioInsightService.test.js` | Weekly summary AI surface |

#### Tenant Portal
| File | What it covers |
|------|----------------|
| `tenantPortalBackendContracts.test.js` | Tenant portal RPC shape |
| `tenantPortalUiContracts.test.js` | Tenant portal UI component contracts |
| `tenantSurfaceIsolation.test.js` | Tenant surface isolation |
| `tenantPortalHelpers.test.js` | Tenant portal helper functions |
| `tenantTimelinePresentation.test.js` | Tenant activity timeline |

---

## 3. Coverage Matrix (High-Level)

| Area | Integration | Contract | Gap |
|------|-------------|----------|-----|
| Account isolation | ✓ | ✓ | None |
| Tenant/contractor scope | ✓ | ✓ | None |
| Document/storage access | ✓ | ✓ | None |
| Document extraction security | ✓ | ✓ | None |
| Work-order golden path | ✓ | ✓ | None |
| Work-order audit log + notifications | ✓ | — | None |
| Compliance Suite (Tax, RS, LA) | ✓ | ✓ | None |
| Contractor portal UI contracts | — | ✓ | Async data-loading path not testable via static render |
| Tenant portal empty states | — | ✓ | None |
| AI feature gate / output normalization | — | ✓ | No live integration test (Edge Functions cloud-only) |
| Feature-gated AI/backend denial | ✓ | ✓ | None |
| AI quota enforcement | — | ✓ | No integration test (requires metered usage seed) |
| Localization parity | — | ✓ | No runtime rendering test |
| CORS hardening | — | ✓ (source audit) | No network-level test |
| Rate limiting | ✓ | ✓ | Load test not present |

---

## 4. Known Limitations (Open)

These are tracked in `docs/COMPLIANCE_SUITE_LIMITATIONS.md`:

- **L-007**: Document extraction text not gated behind feature check at RLS layer (only at RPC layer). Mitigation: RPC gate is enforced; direct table access requires `user_can_manage_account`.
- **L-011**: No per-document audit when `list_document_extractions` is called (only `extraction_viewed` is audited). Mitigation: acceptable for list operations.
- **L-021**: `ai_lease_auditor` feature key not checked before returning findings from `list_lease_audit_findings`. Mitigation: `assert_manage_account_access` still blocks all non-managers.

---

## 5. Known Remaining Gaps

These gaps are tracked here, not as blocking issues, but as inputs for future QA sprints.

| Gap | Priority | Notes |
|-----|----------|-------|
| Playwright E2E covering full browser login → dashboard → work order flow | P1 | Not yet implemented. Static rendering tests do not execute JS or hooks. |
| Contractor portal work order card rendering with async data | P1 | `renderToStaticMarkup` cannot await effects. Needs JSDOM + `act()` or Playwright. |
| AI Edge Function integration tests | P1 | Require cloud Supabase. Cannot run in local harness without Edge Function emulation. |
| AI usage meter increment integration test | P2 | Requires seeded `ai_usage_meter` rows + a real quota guard call. |
| Mobile visual regression | P2 | No Playwright mobile viewport or Percy/Chromatic integration. |
| Performance / load testing | P3 | No k6 or Gatling setup. |
| Live staging smoke tests | P2 | Documented in `RELEASE_SMOKE_CHECKLIST.md` as manual steps. |
| Pre-existing failures (8 security tests) | P1 | `commandCenterEpic3Contracts`, `customFieldsDisplay/Edit/Form`, `phase7RemainingLimitations`, `safeEdgeErrorResponse`, `tenantPortalBackendContracts`, `tenantSurfaceIsolation` — were failing before this QA pass; tracked separately. |

---

## 6. Running Tests

### Unit / contract tests only
```bash
npm test
# or
npx vitest run tests/security/
```

### Integration tests (requires local Supabase)
```bash
cp .env.integration.example .env.integration.local
# fill in TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY, TEST_USER_PASSWORD
npx vitest run tests/integration/
```

### Single test file
```bash
npx vitest run tests/integration/oasisGoldenWorkflow.test.js --reporter=verbose
npx vitest run tests/integration/workOrderAuditAndNotifications.test.js --reporter=verbose
npx vitest run tests/security/localizationKeyContracts.test.js --reporter=verbose
npx vitest run tests/security/aiFeatureGateContracts.test.js --reporter=verbose
npx vitest run tests/security/contractorPortalUiContracts.test.js --reporter=verbose
npx vitest run tests/security/tenantPortalEmptyStateContracts.test.js --reporter=verbose
```

---

## 6. Adding New Tests

1. **Integration test**: copy `tests/integration/complianceBackendSecurity.test.js` as a template. Always use `describe.skipIf(!isIntegrationHarnessConfigured())`.
2. **Contract test**: copy `tests/security/localizationKeyContracts.test.js` or `tests/security/rpcContracts.test.js` as a template.
3. Update this document's inventory table.
