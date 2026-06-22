# Provenance Sprint 2 — Phase 0 Discovery Report

**Date:** 2026-06-22
**Sprint:** Sprint 2 — Explain & Trust
**Phase:** 0 — Discovery, reconciliation design, and implementation proposal
**Status:** Awaiting review before Phase 1 implementation

---

## 1. Finance Source-of-Truth Findings

### 1A. Primary Balance Source: `finance_snapshot` RPC

**File:** `supabase/finance_snapshot.sql` (374 lines)
**Signature:** `finance_snapshot(p_account_id uuid, p_tenant_id uuid default null)`
**Type:** SECURITY DEFINER, `search_path = public`

This is the **authoritative backend balance calculation**. It computes balances on-the-fly from raw data — no denormalized balance columns exist anywhere.

**Returns:**

| Column | Type | Meaning |
|--------|------|---------|
| `total_income` | numeric | Cash received in current calendar month (MTD) |
| `overdue_income` | numeric | Accumulated unpaid balance from months before current month |
| `due_soon_income` | numeric | Total unpaid balance due within 7 days |
| `outstanding_income` | numeric | ALL accumulated unpaid balances (the "Total Owed" card) |
| `property_finance` | jsonb | Per-property breakdowns (paid, remaining, status) |
| `account_currency` | text | ISO 4217 code (e.g. 'GBP', 'PLN') |

**Algorithm (CTE pipeline):**

1. `scoped_payments` — all payment records for account, normalized status
2. `payment_rows` — determines is_paid (paid_at set OR status='paid'), groups by cycle_month
3. `payment_cycles` — per property/tenant/month: billed_amount, paid_amount, has_overdue
4. `property_tenure` — when rent obligations started (earliest active lease start OR earliest payment due_date)
5. `property_accumulated` — all-time: total_paid_alltime, months_elapsed since tenure start
6. `finance_totals`:
   - **outstanding_income** = `months_elapsed × rent - total_paid_alltime` (across occupied properties)
   - **overdue_income** = `(months_elapsed - 1) × rent - total_paid_alltime` plus current-cycle overdue balances
7. `property_rows` — per-property: `remaining = months_elapsed × rent - total_paid_alltime` (floored at 0)

**Critical insight:** The balance formula is `expected_total - actual_total` where expected is derived from `properties.rent × months_elapsed` and actual from `sum(payments.amount) where is_paid`. There is no invoice/charge table driving the "expected" side — just `properties.rent` as a flat monthly rate.

### 1B. Tables Driving Balances

| Table | Role in Balance | Key Columns |
|-------|----------------|-------------|
| `payments` | Actual amounts received/owed | amount, status, due_date, paid_at, property_id, tenant_id, account_id |
| `properties` | Monthly rent rate | rent (numeric), tenant_id, account_id |
| `leases` | Tenure start date | lease_start_date, lease_end_date, renewal_status, property_id, account_id |
| `tenants` | Occupancy detection | property_id, account_id, archived_at, user_id |
| `accounts` | Currency | currency (text, ISO 4217) |

**Not used by `finance_snapshot`:**
- `ledger_entries` — exists but not queried for balance; populated as a side effect via trigger
- `expected_charges` — rent engine scheduling table; not included in balance calculation
- `payment_events` — audit table populated by trigger; not used for balance

### 1C. Secondary/Client-Side Calculations

| Location | Function | Used By | Difference from `finance_snapshot` |
|----------|----------|---------|-----------------------------------|
| `src/utils/finance.js` | `calculatePropertyFinance()` | PropertyDetails, PerformanceCard | Simpler per-property calc, same algorithm concept but from JS-passed props |
| `src/utils/financeSnapshot.js` | `getFinanceOverdueAmount()` | Finance page helpers | Extracts from finance_snapshot JSONB output |
| `src/utils/financePayments.js` | `buildFinancePaymentDisplayRows()` | Finance payment tab | Display allocation (FIFO by due_date), no balance calculation |
| Dashboard | `dashboard_snapshot` RPC | Dashboard page | Separate RPC, can differ from finance_snapshot by seconds |

### 1D. Known Finance Inconsistency Risks

1. **JS vs SQL variance**: `calculatePropertyFinance()` (JS) uses simpler logic than `finance_snapshot` (SQL). If `property.rent` passed as prop differs from DB rent, mismatch possible.
2. **Dashboard vs Finance page**: Different RPCs (`dashboard_snapshot` vs `finance_snapshot`), can diverge under concurrent writes.
3. **Expected charges excluded**: Scheduled charges (`rent_plans` → `expected_charges`) don't affect balances until posted as payments.
4. **Rent as flat rate**: No graduated rent, no mid-month prorating. If rent changes, historical months use current rent in `finance_snapshot` (it reads `properties.rent` as a static value for all months).
5. **Void payments**: `void_payment()` sets `status='void'` and the trigger deletes the corresponding ledger entry. `finance_snapshot` excludes void payments via `is_paid` logic (paid_at set AND not void).

---

## 2. Existing Tables/RPCs/Components Inspected

### SQL Files Read

| File | Contents |
|------|----------|
| `supabase/finance_snapshot.sql` | Primary balance RPC (374 lines) |
| `supabase/payment_write_authorization.sql` | create_payment, update_payment, delete_payment, mark_payment_paid, mark_payment_unpaid RPCs |
| `supabase/payment_ledger_reversal_hardening.sql` | tg_sync_payments_to_ledger trigger with append-only reversal logic |
| `supabase/baseline_schema.sql` | Table definitions: payments, ledger_entries, payment_events, leases, tenants, properties, accounts |
| `supabase/rent_engine_tables.sql` | expected_charges, rent_plans, rent_charge_rules |
| `supabase/provenance_events.sql` | Provenance ledger overlay (700+ lines) |
| `supabase/account_branding.sql` | assert_tenant_scope_access, user_can_manage_account, user_is_root_operator helpers |
| `supabase/security_observability_events.sql` | security_observability_events table |
| `supabase/security_anomaly_alerts.sql` | security_anomaly_alerts table |
| `supabase/log_security_event.sql` | security_audit_ledger writer |

### Frontend Files Confirmed

| File | Role |
|------|------|
| `src/services/financeService.js` | Calls `finance_snapshot` RPC |
| `src/services/paymentService.js` | Payment CRUD via RPCs |
| `src/utils/finance.js` | JS balance calculations |
| `src/utils/financeSnapshot.js` | finance_snapshot JSONB helpers |
| `src/utils/financePayments.js` | Payment display row allocation |
| `src/pages/Finance.jsx` | Finance dashboard (1041 lines) |
| `src/pages/PropertyDetails.jsx` | Property financials tab |

---

## 3. Actual Event-Type Inventory

### 3A. Provenance Events: ZERO application calls exist

`record_provenance_event` is defined in `supabase/provenance_events.sql` and called **only** from `tests/integration/provenanceEventsSecurity.test.js`. No application code, no service, no trigger, no edge function calls it.

**Test event types used:** `test.recorded`, `test.corrected`, `test.reversed`

### 3B. Existing Non-Provenance Audit Tables

| Table | Trigger/Writer | Event Types | Finance-Affecting |
|-------|---------------|-------------|-------------------|
| `payment_events` | `tg_capture_payment_events` (AFTER trigger on payments) | payment_created, payment_paid, payment_overdue, payment_reopened, payment_updated, payment_status_changed, payment_deleted | YES |
| `ledger_entries` | `tg_sync_payments_to_ledger` (AFTER trigger on payments) | N/A — creates in/out entries | YES |
| `deposit_settlement_audit_events` | Application code | settlement_created, deduction_added, deduction_updated, evidence_linked, statement_generated, settlement_shared, tenant_accepted, tenant_disputed, settlement_locked, settlement_archived | YES (deposit amounts) |
| `compliance_evidence_events` | Application code | tenant_acknowledged, tenant_disputed | NO |
| `inspection_audit_events` | Application code | Unconstrained | NO |
| `document_packet_events` | Application code | created, sent, viewed, completed, voided, signature_* | NO |
| `maintenance_diagnostic_audit_events` | Application code | session_started, session_completed, etc. | NO |
| `mtd_quarterly_submission_events` | Application code | sandbox_submission_* | NO (tax reporting) |
| `security_audit_ledger` | `log_security_event()` | Unconstrained | NO |
| `security_observability_events` | Edge functions / application | Unconstrained | NO |

### 3C. Finance Operations Not Emitting Any Events

| Operation | RPC | Provenance Event? | Any Audit Event? |
|-----------|-----|-------------------|-----------------|
| Rent plan created | Frontend CRUD | NO | NO |
| Rent plan activated/terminated | Frontend CRUD | NO | NO |
| Expected charge generated | `generate_expected_charge()` | NO | NO |
| Expected charge posted → payment | `post_expected_charge()` | NO | Triggers payment_events via tg_capture_payment_events |
| Expected charge cancelled | Frontend CRUD | NO | NO |
| Rent plan recalculated | Frontend | NO | NO |

---

## 4. Proposed Canonical Finance Event Ruleset

### 4A. Sign Convention

| Condition | `balance_minor` sign | Meaning |
|-----------|---------------------|---------|
| Positive | Tenant owes / arrears | Amount owed to landlord |
| Negative | Tenant credit | Overpayment or deposit credit |

All `amount_minor` values in provenance events are **unsigned positive integers** (minor units, e.g. pence/grosze). The `signed_amount_minor` is derived by the explain RPC based on treatment.

### 4B. Event Type Mapping

| event_type | Balance Treatment | amount_minor required | Source Table/Entity | Currently Emitted | Missing | Backfill Required |
|------------|-------------------|----------------------|---------------------|-------------------|---------|-------------------|
| `rent.charged` | debit (+) | YES | payments (status='due') | NO | YES | YES — backfill from existing payments with due_date |
| `rent.paid` | credit (−) | YES | payments (paid_at set) | NO | YES | YES — backfill from payments where is_paid |
| `rent.overdue` | informational | NO | payments (status='overdue') | NO | YES | Optional — status annotation only |
| `rent.reopened` | reversal of `rent.paid` | YES | payments (paid_at cleared) | NO | YES | YES — backfill from payment_events where event_type='payment_reopened' |
| `rent.voided` | reversal of `rent.charged` | YES | payments (status='void') | NO | YES | YES — backfill from payment_events where event_type='payment_deleted' or void |
| `rent.adjusted` | supersession | YES | payments (amount changed) | NO | YES | YES — backfill from payment_events where event_type='payment_updated' and amount changed |
| `deposit.received` | informational | YES | deposit_settlement_audit_events | NO | YES | Optional — deposit tracking is separate from rent balance |
| `deposit.deduction` | informational | YES | deposit_settlement_audit_events (deduction_added) | NO | YES | Optional |
| `deposit.returned` | informational | YES | deposit_settlement_audit_events (settlement_locked) | NO | YES | Optional |

**Scope decision:** Sprint 2 "Explain This Balance" should focus on rent balance events only (`rent.*`). Deposit events are informational context but do not affect the rent balance that `finance_snapshot` calculates. Deposit events can be added in a later sprint without breaking the balance equation.

### 4C. Balance Equation

For any tenancy at any point in time:

```
balance_minor = SUM(contribution_minor) for all active events
```

Where:
- `rent.charged` → `contribution_minor = +amount_minor`
- `rent.paid` → `contribution_minor = -amount_minor`
- `rent.voided` → `contribution_minor = -amount_minor` (nets out the original charge)
- `rent.reopened` → `contribution_minor = +amount_minor` (nets out the original payment)
- `rent.adjusted` → supersedes the original charge; original gets `contribution_minor = 0`, adjustment gets `contribution_minor = +new_amount_minor`
- `rent.overdue` → `contribution_minor = 0` (informational)

---

## 5. Supersession/Reversal Rules

### Canonical Ruleset

1. **sequence_number order is the authority for netting.** Events are applied in sequence_number order within an account. Event dates (occurred_at, recorded_at) do not determine correction precedence.

2. **Superseded events do not contribute to active balance.** When event B has `supersedes_event_id = A.id`, event A's `contribution_minor` becomes `0` in the explain output. Event B carries the new `contribution_minor`.

3. **Reversal events net out the referenced event.** When event C has `reversal_of_event_id = A.id`, event A's `contribution_minor` becomes `0` and event C also has `contribution_minor = 0`. The pair cancels.

4. **Reversed/superseded events appear in the explanation with zero contribution.** They are returned with `treatment: 'reversed'` or `treatment: 'superseded'` so the user can see the audit trail.

5. **Every returned event includes its balance treatment.** The frontend never infers treatment or recalculates sign.

6. **Double-reversal is blocked.** You cannot reverse an event that has already been reversed (enforced by checking existing reversal_of references). Similarly, you cannot supersede an already-superseded event.

7. **Cross-entity corrections require a reason.** Already enforced by `record_provenance_event`.

---

## 6. Per-Event Output Contract

Every event returned by `explain_tenancy_balance` includes:

```typescript
interface ProvenanceBalanceEvent {
  event_id: string;           // provenance_events.id
  sequence_number: number;    // account-scoped sequence
  occurred_at: string;        // ISO-8601 UTC
  recorded_at: string;        // ISO-8601 UTC
  event_type: string;         // e.g. "rent.charged", "rent.paid"
  label: string;              // human-readable: "Rent charged", "Payment received"
  description: string;        // e.g. "June 2026 rent — 123 Main Street"
  amount_minor: number;       // unsigned, minor units (pence/grosze)
  signed_amount_minor: number; // signed: +debit, -credit (from treatment)
  contribution_minor: number; // net effect on balance (0 if reversed/superseded)
  currency: string;           // ISO 4217
  treatment: 'active' | 'reversed' | 'superseded' | 'informational';
  reason: string | null;      // correction/reversal reason
  source_type: string | null; // e.g. "rpc", "trigger", "backfill"
  source_id: string | null;   // originating payment.id, etc.
  supersedes_event_id: string | null;
  reversal_of_event_id: string | null;
  actor_type: string;         // "human", "system"
  actor_role: string;         // "owner", "admin", "staff"
  evidence_hash: string;      // event_hash from hash chain
  visibility: string;         // "internal" or "account"
  display_order: number;      // 1-indexed, sequence_number order
}
```

### Reconciliation Rule

```
returned.balance_minor === SUM(event.contribution_minor for all events where treatment !== 'informational')
```

The frontend displays `balance_minor` from the RPC response and renders the event list. It never recalculates the balance from the event list. The sum equality is a server-side invariant enforced by the RPC.

---

## 7. RPC Contract Proposal

### `explain_tenancy_balance(p_tenancy_id uuid)`

```sql
create or replace function public.explain_tenancy_balance(
  p_tenancy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
```

**Authorization checks (in order):**

1. `auth.uid()` must be non-null → `'Not authenticated'`
2. Look up tenancy (lease): `select account_id, property_id from leases where id = p_tenancy_id` → `'Tenancy not found'`
3. `account_member_effective_role(v_account_id, auth.uid())` must be in `('owner', 'admin', 'staff')` → `'Account operator role required'`
4. Cross-account: implicit — role check ensures caller belongs to the tenancy's account
5. Tenant access: **rejected for now** — tenant role not in allowed list

**Response shape:**

```jsonb
{
  "account_id": "uuid",
  "tenancy_id": "uuid",
  "property_id": "uuid",
  "balance_minor": 150000,
  "currency": "GBP",
  "events": [ /* ProvenanceBalanceEvent[] — see §6 */ ],
  "legacy_reconciliation": {
    "legacy_balance_minor": 150000,
    "provenance_balance_minor": 150000,
    "difference_minor": 0,
    "status": "matched"         // "matched" | "diverged" | "cannot_compare"
  },
  "chain_verification": {
    "is_valid": true,
    "checked_count": 42,
    "first_broken_sequence": null,
    "first_broken_reason": null
  },
  "anchor_consistency": {
    "has_anchor": true,
    "anchor_verified": true,
    "anchor_at": "2026-06-22T00:00:00Z",
    "anchor_head_sequence": 40,
    "events_after_anchor": 2
  },
  "badge_state": "verified",   // see §9
  "generated_at": "2026-06-22T14:30:00Z"
}
```

**Notes:**
- The `legacy_reconciliation` field computes the legacy balance inline by running the same `finance_snapshot` logic for the specific tenancy/property. This ensures the comparison uses the exact same formula as the dashboard.
- `chain_verification` calls `verify_provenance_chain` internally (owner/admin already authorized).
- For staff callers, chain_verification and anchor_consistency are included but anchor_consistency may show limited detail.

---

## 8. Anchor Design

### 8A. pg_cron Status

**pg_cron is NOT available.** The `supabase/config.toml` does not enable it. The only scheduled functions use Supabase Edge Functions with external schedulers.

**Recommendation:** Implement anchoring as:
1. A SECURITY DEFINER RPC (`anchor_provenance_chains`) callable by owner/admin or service_role
2. A Supabase Edge Function (`anchor-provenance-chains`) that calls the RPC, triggered by external cron (Supabase dashboard scheduler or GitHub Actions)
3. Manual invocation as fallback

### 8B. Table Schema

```sql
create table if not exists public.provenance_chain_anchors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  head_sequence bigint not null,
  head_hash text not null,
  event_count bigint not null,
  chain_verified boolean not null default true,
  anchored_at timestamptz not null default now(),
  anchor_method text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint provenance_chain_anchors_method_check
    check (anchor_method in ('internal', 'manual', 'external'))
);

create unique index provenance_chain_anchors_account_sequence_idx
  on public.provenance_chain_anchors(account_id, head_sequence);

create index provenance_chain_anchors_account_anchored_idx
  on public.provenance_chain_anchors(account_id, anchored_at desc);

alter table public.provenance_chain_anchors enable row level security;
```

### 8C. RPC Names

| RPC | Purpose | Authorization |
|-----|---------|---------------|
| `anchor_provenance_chain(p_account_id uuid)` | Create anchor for one account | owner, admin, service_role |
| `anchor_all_provenance_chains()` | Batch anchor all accounts (for cron) | service_role only |
| `verify_provenance_anchor(p_account_id uuid, p_anchor_id uuid)` | Verify a specific anchor still holds | owner, admin |

### 8D. Anchor Logic

```
1. Call verify_provenance_chain(p_account_id)
2. If NOT is_valid → skip this account, log alert, continue
3. Read current head from provenance_event_counters (head_hash, next_sequence - 1)
4. Check dedup: if anchor already exists for this (account_id, head_sequence) → skip
5. Insert anchor row
6. One account failure must not roll back the whole batch
```

### 8E. Anchor Verification (in `explain_tenancy_balance`)

```
1. Find most recent anchor for account
2. Read the provenance event at anchor.head_sequence
3. Compare event.event_hash to anchor.head_hash
4. If match → anchor is consistent
5. If mismatch → anchor_verified = false (chain was tampered after anchoring)
6. Legitimate later events (sequence > anchor.head_sequence) do NOT invalidate the anchor
```

### 8F. Frequency/Dedup

- Target: once daily per account
- Dedup: unique index on `(account_id, head_sequence)` — if no new events since last anchor, skip
- Batch: `anchor_all_provenance_chains()` iterates accounts, wraps each in its own BEGIN/EXCEPTION block

### 8G. Alert Mechanism

On anchor failure or chain verification failure:
1. Insert into `security_observability_events` with `category = 'provenance'`, `kind = 'chain_verification_failed'` or `'anchor_mismatch'`
2. Insert into `security_anomaly_alerts` with `alert_type = 'provenance_integrity'`, `severity = 'action'`
3. Both tables already exist and have the right schema for this

---

## 9. Badge and Failure UX Design

### 9A. Badge States

| State | Internal Name | Conditions | User-Facing Label |
|-------|--------------|------------|-------------------|
| Verified | `verified` | Chain verifies + anchor exists + anchor consistent + verification < 24h old | "Balance verified" |
| Verified, not yet anchored | `verified_unanchored` | Chain verifies + no anchor exists yet | "Balance verified" (no anchor badge shown) |
| Verification pending | `pending` | Verification unavailable, stale (> 24h), or transient failure | "Verification in progress" |
| Verification issue detected | `issue` | Chain or anchor check failed | "Verification issue detected" |

### 9B. User-Facing Safe Wording

**For `issue` state:**
> "We could not verify the evidence chain for this balance right now. The balance explanation is temporarily unavailable while checks are completed."

**For `pending` state:**
> "Balance verification is in progress. This may take a moment."

**Never shown to users:**
- "tampered"
- "hash mismatch"
- "chain broken"
- Raw SQL error messages
- Sequence numbers or technical details

### 9C. Internal Handling

On verification failure:
1. Insert `security_observability_events` row with full failure details (failed_sequence, failure_reason, account_id)
2. Insert or update `security_anomaly_alerts` row with `alert_type = 'provenance_integrity'`
3. The explain RPC still returns the event list and balance but sets `badge_state = 'issue'`
4. Export (PDF/CSV) is disabled when `badge_state = 'issue'` — the export button shows "Export unavailable while verification is pending"

---

## 10. Dashboard Relationship

### 10A. Scope for Sprint 2

Sprint 2 does **not** replace any existing dashboard balance. The existing `finance_snapshot` RPC and Finance page continue to work exactly as they do today.

### 10B. What Sprint 2 Must Do

1. **Detect divergence**: The `explain_tenancy_balance` RPC computes both `provenance_balance_minor` and `legacy_balance_minor` (from finance_snapshot logic). If they differ, `legacy_reconciliation.status = 'diverged'`.
2. **Avoid contradictory display**: If the explain view shows a different balance than the dashboard, the explain view must show the divergence warning (not silently show a different number).
3. **No silent replacement**: The dashboard cards (Total Owed, Overdue, etc.) continue to use `finance_snapshot`. The explain view is a drill-down from a tenancy, not a replacement.

### 10C. Future Dashboard Migration

After Sprint 2 stabilizes:
- Sprint 3 could replace `finance_snapshot` with provenance-derived balances
- This requires all finance operations to emit provenance events (the backfill in Sprint 2 covers historical data)
- The reconciliation gate must show 100% match rate before cutover

---

## 11. Pre-Cutover Reconciliation Gate Design

### 11A. Purpose

Before exposing "Explain This Balance" publicly, prove that the provenance ledger produces the same balance as the legacy system for every active tenancy.

### 11B. Legacy Balance Source

The legacy balance for a specific tenancy is derived from the `finance_snapshot` algorithm applied to a single property/tenant:

```sql
-- For a given lease (tenancy):
-- 1. Get property_id, tenant_id, account_id from leases
-- 2. Get properties.rent for the property
-- 3. Get lease_start_date for tenure
-- 4. Compute months_elapsed = months from lease_start to current month (inclusive)
-- 5. Compute total_paid = sum(payments.amount) where is_paid and property_id and tenant_id
-- 6. legacy_balance = max(months_elapsed × rent - total_paid, 0)
```

This is the exact formula from `finance_snapshot`'s `property_accumulated` CTE, narrowed to one tenancy.

### 11C. Gate Output Schema

```sql
create type reconciliation_result as (
  tenancy_id uuid,
  account_id uuid,
  property_id uuid,
  tenant_id uuid,
  legacy_balance_minor bigint,
  provenance_balance_minor bigint,
  currency text,
  difference_minor bigint,
  suspected_missing_event_types text[],
  status text  -- 'matched' | 'diverged' | 'cannot_compare'
);
```

### 11D. Divergence Classification

| Condition | Status | Suspected Missing |
|-----------|--------|-------------------|
| legacy = provenance | `matched` | `{}` |
| legacy > provenance | `diverged` | `{'rent.charged'}` — missing charge events |
| legacy < provenance | `diverged` | `{'rent.paid'}` — missing payment events |
| No payments AND no provenance events | `cannot_compare` | `{'rent.charged', 'rent.paid'}` — no data |
| Currency mismatch | `cannot_compare` | `{}` |
| No lease found | `cannot_compare` | `{}` |

### 11E. Gate Decision

- **All tenancies matched**: Proceed to expose explain view
- **Any tenancy diverged**: Block public exposure; investigate missing events; run targeted backfill
- **cannot_compare tenancies**: Acceptable if no financial data exists (vacant property, no payments)

### 11F. Dependencies

1. Finance event backfill must complete first (populate `rent.charged` and `rent.paid` events from historical payments)
2. The backfill must use the same formula as `finance_snapshot` to generate charge events
3. The gate runs as a one-time migration or operator-triggered RPC

---

## 12. Test Plan

### 12A. Phase 0 Reconciliation Gate Tests

| Test | Type | Description |
|------|------|-------------|
| matched tenancy | unit | Legacy and provenance produce identical balance for a simple charge+payment tenancy |
| diverged — missing charge | unit | Legacy shows balance but provenance has no charge event → diverged |
| diverged — missing payment | unit | Legacy shows paid but provenance has no payment event → diverged |
| cannot_compare — no data | unit | Empty tenancy reports cannot_compare |
| currency mismatch | unit | Different currencies → cannot_compare |
| gate blocks on divergence | integration | Gate returns non-zero diverged count, explain view not exposed |

### 12B. Event-Type Mapping Tests

| Test | Type |
|------|------|
| rent.charged creates positive contribution | unit |
| rent.paid creates negative contribution | unit |
| rent.voided nets out original charge | unit |
| rent.reopened nets out original payment | unit |
| rent.adjusted supersedes original charge | unit |
| rent.overdue has zero contribution | unit |
| contribution_minor sums to balance_minor | unit |
| mixed currency rejected | unit/integration |

### 12C. Explain RPC Tests

| Test | Type |
|------|------|
| Simple charge + payment returns correct balance and 2 events | integration |
| Reversal: charge + payment + reopening returns 3 events, correct balance | integration |
| Supersession: charge + adjustment returns 2 events, original has contribution=0 | integration |
| Duplicate payment void: charge + 2 payments + 1 void returns correct balance | integration |
| Empty tenancy returns balance_minor=0 and empty events | integration |
| legacy/provenance divergence detected and reported | integration |

### 12D. Authorization Tests

| Test | Type |
|------|------|
| Owner can call explain_tenancy_balance | integration |
| Admin can call explain_tenancy_balance | integration |
| Staff can call explain_tenancy_balance (current product policy: allowed) | integration |
| Tenant denied | integration |
| Cross-account denied | integration |
| Unauthenticated denied | integration |

### 12E. Chain & Anchor Tests

| Test | Type |
|------|------|
| chain_verification included in response | integration |
| anchor_consistency included in response | integration |
| anchor comparison at anchored sequence | unit |
| Legitimate later events do not break anchors | unit |
| Failed verification sets badge_state='issue' | unit |
| Failed verification disables export | unit/e2e |

### 12F. Frontend Contract Tests

| Test | Type |
|------|------|
| Frontend never recalculates balance from events | contract |
| Frontend displays balance_minor from RPC, not sum of events | contract |
| badge_state drives badge rendering | contract |
| issue state shows safe wording, not technical details | contract |

---

## 13. Risks and Questions

### 13A. Critical Risks

1. **Provenance ledger has zero finance events today.** Every finance operation must be instrumented before explain can work. This is a large backfill and instrumentation effort.

2. **The tenancy entity is `leases`, not a dedicated tenancy table.** The `tenancy_id` column in `provenance_events` will store `leases.id`. This must be documented and consistent.

3. **`finance_snapshot` uses `properties.rent` as a static flat rate.** If rent has changed over time, the expected total is wrong (it uses current rent × all months). The provenance-based system can be more accurate if `rent.charged` events capture the actual rent at each billing cycle. But then the provenance balance will diverge from the legacy balance. **Decision needed: should the provenance balance match the legacy formula (current rent × months) or use actual historical rent?**

4. **No per-tenancy balance in `finance_snapshot`.** The legacy system computes per-property balances, not per-tenancy (lease). A property with multiple sequential leases will have one accumulated balance. The provenance system scopes events by `tenancy_id` (lease.id), which is more granular. **This means the reconciliation gate cannot do an exact comparison for properties with multiple leases** — the legacy per-property total may differ from the sum of per-tenancy provenance balances.

5. **Backfill depends on `payment_events` audit trail.** Reversals, voids, and adjustments can only be backfilled if `payment_events` has a complete history. If `payment_events` was added after some payments existed, those early events may be missing.

### 13B. Open Questions

1. **Should staff access explain_tenancy_balance?** The provenance verifier (`verify_provenance_chain`) is owner/admin only. But balance explanation is a different surface — staff may need it for tenant queries. **Recommendation: allow staff read access to explain, but not to chain verification details.**

2. **Should the provenance balance use actual historical rents or match the legacy formula?** If actual → more accurate but will diverge from dashboard. If legacy → less accurate but zero divergence at cutover. **Recommendation: match the legacy formula for Sprint 2 to enable the reconciliation gate. Add actual-rent tracking in Sprint 3.**

3. **How to handle properties with no lease?** Some properties have payments but no lease record. `finance_snapshot` handles this via `property_tenure` fallback (earliest payment due_date). The provenance system needs a tenancy_id. **Recommendation: use a sentinel "no-lease" tenancy or allow tenancy_id=null for orphan payments.**

4. **Should deposit events affect the rent balance?** The current `finance_snapshot` does not include deposits in the balance. **Recommendation: deposits are informational in Sprint 2. Document this clearly.**

---

## 14. Recommendation

### Proceed with changes

Sprint 2 implementation is viable but requires addressing these prerequisites before Phase 1:

**Must resolve before Phase 1:**

1. Confirm tenancy entity: `provenance_events.tenancy_id` stores `leases.id`
2. Decide: match legacy formula vs actual historical rent for Sprint 2
3. Accept that reconciliation gate will be per-property (not per-tenancy) for properties with multiple leases, or design a tenancy-level legacy balance derivation
4. Confirm staff access policy for explain_tenancy_balance

**Phase 1 implementation order:**

1. Event-type instrumentation: add `record_provenance_event` calls to payment write RPCs (`create_payment`, `mark_payment_paid`, `mark_payment_unpaid`, `void_payment`, `delete_payment`, `update_payment`)
2. Historical backfill: generate `rent.charged` and `rent.paid` events from existing payments + payment_events
3. Reconciliation gate: implement and run pre-cutover comparison
4. `explain_tenancy_balance` RPC
5. Anchor table and anchor RPC
6. Badge logic
7. Frontend explain component
8. Tests

**Should NOT block on:**
- pg_cron (use Edge Function scheduler)
- Deposit events (informational, not balance-affecting)
- Dashboard replacement (Sprint 3)
- Tenant access to explain view (Sprint 3)
