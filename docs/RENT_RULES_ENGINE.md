# Rent Rules Engine — Technical Reference

## Feature availability

The core Rent Rules Engine is available to **all active OASIS plans** (Starter, Growth, Pro, Operator/Agency).

No Growth+ gate blocks rent calculation, rent plans, expected charges, or manual safe posting.

| Feature | Starter | Growth | Pro | Operator/Agency |
|---|---|---|---|---|
| Rent plans (create/activate/view) | ✓ | ✓ | ✓ | ✓ |
| Rent charge rules | ✓ | ✓ | ✓ | ✓ |
| Calculation previews + proration | ✓ | ✓ | ✓ | ✓ |
| Deposit checks/warnings | ✓ | ✓ | ✓ | ✓ |
| Basic utilities configuration | ✓ | ✓ | ✓ | ✓ |
| Expected charges | ✓ | ✓ | ✓ | ✓ |
| Safe manual posting to Finance | ✓ | ✓ | ✓ | ✓ |
| Audit/version history | ✓ | ✓ | ✓ | ✓ |
| Command Center rent-rule attention items | ✓ | ✓ | ✓ | ✓ |
| Bulk portfolio automation | — | — | — | ✓ (future) |
| Advanced AI finance insights | — | — | — | ✓ (future) |
| Open Banking integration | — | — | — | ✓ (future) |
| Automated payment reconciliation | — | — | — | ✓ (future) |
| Portfolio-wide finance forecasting | — | — | — | ✓ (future) |

## Entitlement keys

```js
// Core — all active plans
RENT_RULES_CORE:        "rent_rules_core"
EXPECTED_CHARGES_CORE:  "expected_charges_core"

// Premium — Operator/Agency tier (future gates)
RENT_RULES_BULK_AUTOMATION:    "rent_rules_bulk_automation"
RENT_AI_FINANCE_INSIGHTS:      "rent_ai_finance_insights"
OPEN_BANKING_RENT_MATCHING:    "open_banking_rent_matching"
PORTFOLIO_FINANCE_FORECASTING: "portfolio_finance_forecasting"
```

Suspended/cancelled account locks (`trial_expired`, `billing_locked`, etc.) still block access via the existing LOCKED_PLAN_SENTINELS mechanism.

---

## Data model

### rent_plans

Configurable rent schedule attached to an account (optionally to a property and/or tenant). Plans are versioned — the engine supersedes rather than overwrites active plans.

Key fields: `account_id`, `property_id`, `tenant_id`, `lease_id`, `market`, `currency`, `billing_frequency`, `base_rent_amount`, `due_day`, `start_date`, `end_date`, `proration_policy`, `deposit_policy`, `deposit_amount`, `utilities_policy`, `rounding_policy`, `status`, `version_number`, `supersedes_id`.

### rent_charge_rules

Additional line items attached to a rent plan (utilities, service charges, parking, deposits, adjustments).

Key fields: `account_id`, `rent_plan_id`, `charge_type`, `label`, `amount`, `calculation_type`, `frequency`, `included_in_rent`, `taxable_flag`, `effective_from`, `effective_to`.

### rent_calculation_runs

Immutable audit records of every calculation. No `updated_at` — once written, never changed. Status moves forward-only via RPCs.

Key fields: `account_id`, `rent_plan_id`, `tenant_id`, `property_id`, `period_start`, `period_end`, `calculation_input` (JSONB snapshot), `calculation_result` (JSONB), `warnings` (JSONB), `status` (preview → approved → posted | discarded).

### expected_charges

Scheduled charges derived from a calculation run. Not a payment record — exists in a separate lifecycle before being posted to Finance.

Key fields: `account_id`, `rent_plan_id`, `tenant_id`, `property_id`, `charge_type`, `period_start`, `period_end`, `due_date`, `amount`, `currency`, `status` (scheduled → posted | cancelled | superseded), `source`, `calculation_run_id`, `posted_payment_id`.

Unique index: prevents duplicate charges for the same `(account_id, tenant_id, property_id, charge_type, period_start)` unless the charge is cancelled/superseded.

---

## Rent plan lifecycle

```
[draft] → activate_rent_plan() → [active]
                                     ↓ (new plan activated for same property/tenant)
                                 [superseded]
[active] → end manually → [ended]
```

Rules:
- Only one `active` plan per `(account_id, property_id, tenant_id)` — enforced by partial unique index.
- Plans are never hard-deleted.
- Activating a new plan automatically supersedes the current active plan.

---

## Charge rules

Charge rules extend a rent plan with additional line items. Each rule has a `charge_type`, `calculation_type`, and `frequency`. Rules with `included_in_rent = true` are shown as a breakdown, not double-charged.

Supported `calculation_type`: `fixed`, `percentage`, `metered`, `formula`, `manual`.

---

## Proration methods

| Policy | Description |
|---|---|
| `actual_days_in_month` | Monthly rent ÷ actual days in that month × occupied days |
| `thirty_day_month` | Monthly rent ÷ 30 × occupied days (regardless of actual month length) |
| `annual_daily_365` | Annual rent ÷ 365 × occupied days |
| `annual_daily_actual_year` | Annual rent ÷ 365 (or 366 in leap year) × occupied days |
| `no_proration` | Full month charged regardless of move-in date |
| `manual_override` | User-supplied proration amount (requires reason field) |

All monetary arithmetic uses integer pence internally (`toPence` / `fromPence`) to eliminate floating-point drift. Rounding is applied at the configured boundary only.

---

## Deposit checks by market

Deposit checks are **warnings only** — not legal enforcement. OASIS does not claim legal certainty.

### UK / England

- Annual rent < £50,000: deposit warning if > 5 weeks' rent
- Annual rent ≥ £50,000: deposit warning if > 6 weeks' rent
- Wording: "Deposit warning — check this against your local rules. Not legal advice."

### Poland

- Configurable warning placeholder (default: warn if > 3× monthly rent)
- No UK cap logic applied
- Wording: "Deposit guidance — check this against your local rules. Not legal advice."

### Generic / other markets

- No statutory check by default
- Custom warning threshold configurable via charge rule metadata

---

## Utilities

| Policy | Behaviour |
|---|---|
| `rent_only` | Only base rent charged |
| `fixed_utility_charge` | Base rent + fixed utility line item (from charge rules) |
| `bills_inclusive` | Base rent covers bills — breakdown shown internally, tenant not double-charged |
| `variable_utility_charge` | Placeholder for metered utilities (Epic 2) |

---

## Expected charges

Expected charges represent scheduled payment obligations before they are posted to Finance.

Lifecycle:
1. Run calculation preview (no ledger write)
2. User approves → `generate_expected_charge()` creates a `scheduled` record
3. User reviews in Finance → `post_expected_charge()` creates a payment via `create_payment()` RPC
4. Payment creation may trigger ledger entry via existing Finance flow (append-only preserved)

**Creating an expected charge does not record a payment.**

**Posting to Finance creates a finance record through the approved ledger flow.**

---

## Safe ledger posting

The calculation engine **never** writes to `ledger_entries` directly.

```
preview  ──→  approved  ──→  posted
(no write)   (no write)    post_expected_charge()
                                ↓
                          create_payment()   ← existing approved RPC
                                ↓
                          ledger entry via existing Finance flow
```

`post_expected_charge()` is a `security definer` RPC that:
1. Verifies account access via `assert_manage_account_access()`
2. Verifies expected charge status = `scheduled`
3. Calls `create_payment()` — the same RPC used by the existing Finance module
4. Updates the expected charge to `posted` with a `posted_payment_id` reference

If posting fails, the expected charge remains `scheduled` — no partial state corruption.

---

## Command Center integration

Rent-rule attention items are surfaced in the existing Command Center (not a separate page).

| Item key | Bucket | Trigger |
|---|---|---|
| `rent_plan_missing` | action | Property/tenant has payments but no rent plan |
| `rent_plan_draft` | action | Rent plan in draft status not yet activated |
| `expected_charge_overdue` | urgent | Scheduled expected charge past due date unposted |

Each item includes: `item_key`, `bucket`, `property_label`, `tenant_label`, `entity_label`, `amount`, `due_date`, `link_path`, `source_type`, `sort_order`.

Implementation: `supabase/attention_center_items.sql` — `rent_plan_items` CTE added to the `unioned` set.

---

## RLS / security model

All new tables use the existing `user_can_manage_account(account_id)` pattern:

| Role | rent_plans | rent_charge_rules | rent_calculation_runs | expected_charges |
|---|---|---|---|---|
| Owner/Admin | SELECT/INSERT/UPDATE | SELECT/INSERT/UPDATE/DELETE | SELECT/INSERT | SELECT/INSERT/UPDATE |
| Staff | Follows Finance permissions | Follows Finance permissions | Follows Finance permissions | Follows Finance permissions |
| Tenant | Denied | Denied | Denied | Denied |
| Contractor | Denied | Denied | Denied | Denied |
| Cross-account | Denied | Denied | Denied | Denied |

RPCs use `security definer` + `assert_manage_account_access()` to enforce account isolation for all mutations.

---

## Testing strategy

### Unit tests (`tests/unit/rentCalculationEngine.test.js`)
~80 tests covering: frequency conversion, all 6 proration policies, leap year handling, UK deposit cap (5/6 week threshold), Poland deposit warning, generic deposit, split rent, full calculation runs, billing period generation, rounding behaviour.

### Security contract tests (`tests/security/rentEngineContracts.test.js`)
6 RLS tests: cross-account plan denial, cross-account expected charge denial, ledger immutability (post_expected_charge does not write ledger_entries directly), tenant visibility restricted, contractor access denied, duplicate charge prevention via unique index, activate non-draft error.

### E2E tests (`tests/e2e/rent-plans.spec.js`)
7 Playwright tests: page loads with empty state, create draft plan, preview calculation panel, activate plan with badge update, mobile layout without overflow, Finance regression, payment ledger regression.

### Regression coverage
All existing modules verified: Finance, payment ledger, Rent Matching, Tax Readiness, Rent Shield, Command Center, Dashboard, Poland Compliance Toolkit, Documents, Lease Auditor.

---

## Known limitations

- **Metered utilities**: `variable_utility_charge` policy is a placeholder — meter reading input and variable billing is planned for Epic 2.
- **Formula charge rules**: `calculation_type = formula` is defined in the schema but formula parsing is not yet implemented.
- **Tenant split**: `splitRent()` supports equal/percentage/fixed/room_based but the UI currently only exposes the full plan amount — per-tenant splits are for future Epic.
- **Bulk scheduling**: Generating expected charges for multiple future periods at once is a premium automation feature (future).
- **Direct ledger query from engine**: The engine currently does not read `ledger_entries` to determine outstanding balances — this lookup is done by the existing Finance page separately.

---

## Future advanced models (premium tier)

- Bulk portfolio automation — generate expected charges across all tenants in one action
- Advanced AI finance insights — GPT-powered rent analysis and anomaly detection
- Open Banking / rent matching integration — reconcile bank transactions against expected charges
- Automated payment reconciliation — zero-touch matching for matched payments
- Portfolio-wide finance forecasting — 12-month cash flow projections
