# Provenance Sprint 2B — Phase 0 Discovery Report

## 1. How finance_snapshot handles lease end, vacancy, and period boundaries

### Lease filtering

`finance_snapshot` → `property_tenure` CTE filters leases with:
```sql
lower(coalesce(l.renewal_status, 'active')) not in ('ended')
```

**It does NOT check `lease_end_date`.** A lease with `renewal_status = 'active'` and a
past `lease_end_date` continues to be included. Accrual runs from the earliest non-ended
lease start to the current month regardless.

This is a CONSCIOUS legacy behavior. The `renewal_status` state machine is:
`active`, `expiring_soon`, `renewal_in_progress`, `renewed`, `ended`. Only `ended`
removes a lease from accrual. The system does not auto-end leases; an operator must
set `renewal_status = 'ended'`.

### Vacancy

`property_occupancy` CTE:
```sql
sp.tenant_id is not null
or exists (select 1 from tenants t where ... and t.archived_at is null)
```

A property is occupied if `properties.tenant_id` is not null OR a non-archived tenant
exists. Archived tenants (`archived_at is not null`) do NOT count. Vacant properties
appear in the result with `remaining = 0` and `payment_status = 'vacant'`.

`finance_property_accumulation()` (our shared helper) mirrors this with:
```sql
where po.has_assigned_tenant or pa.computed_total_paid > 0
```

Properties with no assigned tenant AND no paid payments are excluded entirely.

### Period boundaries / months_elapsed

```sql
months_elapsed = greatest(
  extract(year from age(current_month, rent_start_month)) * 12
  + extract(month from age(current_month, rent_start_month))
  + 1,  -- include start month
  1     -- minimum 1
)
```

- Inclusive of start month (+1)
- Recomputed live at read time → ticks at every month boundary
- No upper cap from lease_end_date
- Uses `date_trunc('month', current_date)` for the current month

### Decision for 2B (B9)

**Mirror exactly.** `provenance_accrue_rent_charges` will use the shared helper's period
logic and stop accrual only when `renewal_status = 'ended'`. We will NOT cap at
`lease_end_date`. This means rent accrues past a lease's stated end date if the operator
hasn't set `renewal_status = 'ended'`.

This is documented as a CONSCIOUS decision: mirroring the legacy formula ensures
reconciliation holds. If `finance_snapshot` accrues, provenance accrues. Deposit disputes
pulling up a balance past lease end will see the same figure from both systems.

Note in metadata: `accrual_continues_past_lease_end_date: true` when the current date
exceeds `lease_end_date` but `renewal_status` is not `ended`.

---

## 2. Anchoring infrastructure audit

### What exists (Sprint 1/1.5)

- `provenance_event_counters` table: `account_id`, `next_sequence`, `head_hash`
- `provenance_events` table with `event_hash`, `previous_event_hash`, `hash_version`
- BEFORE INSERT trigger: `provenance_compute_hash_before_insert` (computes hash chain)
- AFTER INSERT trigger: `provenance_advance_head_hash_after_insert` (updates head_hash)
- `verify_provenance_chain(p_account_id)` RPC: walks entire chain, checks sequence gaps,
  hash links, canonical payload, counter head_hash/next_sequence drift. Returns
  `is_valid`, `checked_count`, `first_broken_sequence`, `first_broken_reason`.
- `provenance_genesis_sentinel()`, `provenance_canonical_payload_v0()`, `provenance_lp()`

### What does NOT exist

- `provenance_chain_anchors` table — **must be created**
- `anchor_provenance_chain()` — **must be created**
- `anchor_all_provenance_chains()` — **must be created**
- `verify_provenance_anchor()` — **must be created**
- `provenance_chain_status` (cached verification status) — **not implemented**
- No scheduled anchor job (no pg_cron)

### Anchoring design

```sql
create table public.provenance_chain_anchors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  head_sequence bigint not null,
  head_hash text not null,
  event_count bigint not null,
  anchor_hash text not null,  -- SHA-256(account_id || head_sequence || head_hash || event_count)
  anchored_at timestamptz not null default now(),
  anchored_by uuid,           -- auth.uid() or null for system
  constraint provenance_chain_anchors_unique_head
    unique (account_id, head_sequence)
);
```

- Append-only: no UPDATE/DELETE/TRUNCATE via API
- `anchor_provenance_chain(p_account_id)`: verify chain first, then snapshot current
  head. Deduplicate by `(account_id, head_sequence)`.
- `verify_provenance_anchor(p_account_id)`: find latest anchor, fetch event at
  `head_sequence`, compare `event_hash` to anchor's `head_hash`. Later events do NOT
  invalidate. No anchor = `verified_unanchored`.
- `anchor_all_provenance_chains()`: batch across accounts, one failure per account
  doesn't roll back others. Called by Edge Function or manual.

---

## 3. Period breakdown helper design (B3)

### Problem

`finance_property_accumulation()` returns a COUNT (`months_elapsed`) and a rent. To
emit discrete `rent.charged` events, we need to enumerate individual billing periods.
Re-deriving the period enumeration separately risks drift from the count.

### Solution: `finance_property_period_breakdown` sibling function

```sql
create or replace function public.finance_property_period_breakdown(
  p_account_id uuid,
  p_property_id uuid default null,
  p_as_of date default current_date
)
returns table (
  property_id uuid,
  period_index integer,      -- 1-based, matches months_elapsed counting
  period_start date,
  period_end date,
  period_key text,           -- e.g. '2026-07'
  rent_minor bigint,
  rent_start_date date,
  rent_start_source text,
  currency text
)
```

**How it derives periods:**

1. Call `finance_property_accumulation(p_account_id)` to get `months_elapsed`,
   `rent_start_date`, `rent_minor_used` per property (as of `p_as_of`)
2. For each property, generate a series from 1 to `months_elapsed`
3. Each period:
   - `period_start = rent_start_date + (period_index - 1) months`
   - `period_end = rent_start_date + period_index months - 1 day`
   - `period_key = to_char(period_start, 'YYYY-MM')`
   - `rent_minor = rent_minor_used` (current rent — matches legacy repricing)

**Proof that it sums correctly:**
`count(periods) = months_elapsed` and `sum(rent_minor) = months_elapsed × rent_minor_used`
which equals the obligation in `finance_snapshot`. This is true by construction because
the period count IS `months_elapsed` from the shared helper.

**The accumulation function needs a variant for `p_as_of`:** currently it uses
`current_date` hardcoded. We need to parameterize it (or create a sibling) that accepts
a date parameter, so the explain RPC and the accrual function can compute at a specific
point in time. BUT: for 2B, we only need `current_date` (the accrual is "as of now"),
so we can defer the parameterized version and use `current_date` throughout. The
`p_as_of` parameter on the breakdown function controls how many periods to generate.

---

## 4. Cutover seam design (B4)

### Problem

After cutover, `finance_snapshot` keeps ticking `months_elapsed` each month. The Sprint
2A obligation snapshot is frozen at cutover time. Without post-cutover `rent.charged`
events, provenance drifts by one month's rent per month.

### Solution

The first post-cutover `rent.charged` must pick up from where the obligation snapshot
left off. The snapshot's STORED `months_elapsed` in metadata defines the handoff point.

```
snapshot covers periods 1..N (where N = months_elapsed at cutover)
first rent.charged covers period N+1
second rent.charged covers period N+2
...
```

The accrual function:
1. Reads the obligation snapshot's metadata `months_elapsed` for the property
2. Generates the full period breakdown (1..current_months_elapsed)
3. Skips periods 1..N (covered by the snapshot)
4. Emits `rent.charged` for periods N+1..current_months_elapsed
5. Idempotent via `live:rent.charged:{account}:{property}:{period_key}:{cutover_version}`

### No gap, no overlap

- Periods 1..N: obligation snapshot (gross = N × rent)
- Periods N+1..M: individual `rent.charged` events
- Total obligation = N × rent + (M - N) × rent = M × rent = legacy's months_elapsed × rent ✓

### Month boundary: on-read catch-up (B2)

`explain_property_balance` and `provenance_reconciliation_gate` both call
`provenance_accrue_rent_charges` for the property BEFORE projecting, ensuring the
comparison is current. The accrual is idempotent — duplicate calls emit nothing.

---

## 5. Rent change handling (B10)

### Legacy behavior

`finance_snapshot` uses CURRENT `properties.rent` for ALL elapsed months. If rent changes
from £1000 to £1200, legacy retroactively reprices all history.

### Provenance behavior

The obligation snapshot is frozen with the rent at cutover time. Post-cutover
`rent.charged` events record the rent at the time they're emitted. If rent changes:

- Snapshot: `months_elapsed_at_cutover × old_rent`
- Post-cutover charges: `sum(rent_at_each_period)`
- Legacy: `total_months_elapsed × new_rent`

Divergence = `months_elapsed_at_cutover × (new_rent - old_rent)`

This is classified as `post_cutover_rent_change` (explained divergence). The friendly
copy: "The legacy finance view recalculates ALL earlier months using the current rent.
Provenance keeps the rent that was recorded for each period."

`display_basis = legacy_compatible` — headline shows the legacy figure; the provenance
truth is an explanatory note.

---

## 6. Balance projection update (C)

Current contribution rules + additions:

| Event type | Contribution |
|---|---|
| `finance.legacy_obligation_snapshot` | +amount_minor (debit) |
| `rent.charged` **NEW** | +amount_minor (debit) |
| `payment.recorded` | 0 (INVARIANT) |
| `payment.marked_paid` | -amount_minor (credit) |
| `payment.reopened` | +amount_minor (reverses credit) |
| `payment.voided` | 0 |
| `payment.adjusted` | context-dependent |
| `payment.deleted` | 0 |
| `payment.marked_overdue` | 0 |
| reversed/superseded events | 0 |

`rent.charged` treatment = `active`.

---

## 7. Reconciliation gate update (D)

New divergence categories to add:

| Category | Status | Condition |
|---|---|---|
| `post_cutover_rent_change` | `explained_divergence` | Provenance uses recorded rent per period, legacy uses current rent for all periods |
| `no_financial_data` | `matched` (0=0) | Both sides are zero — no meaningful comparison needed |

The gate must call `provenance_accrue_rent_charges` BEFORE comparing, to ensure accrual
is current.

Existing categories remain:
- `overpayment_credit_clamp` → `explained_divergence`
- `currency_mismatch` → `cannot_compare`
- `derivation_mismatch` → `unexplained_divergence`

Display basis per status:
- `matched` → `display_basis = provenance`
- `overpayment_credit_clamp` → `display_basis = legacy_compatible`
- `post_cutover_rent_change` → `display_basis = legacy_compatible`
- `unexplained_divergence` → no confident display
- `cannot_compare` → limited/empty

---

## 8. UI placement

The "Explain balance" action goes in **PropertyDetails > financials tab**, as a button
next to the property balance figures. This is where landlords already see the property's
financial state. The Finance page property rows can link through to this tab.

The explanation opens as a **drawer/panel** (slide-over from right), consistent with other
detail panels in the app (work order drawers, document panels, etc.).

---

## 9. Implementation plan (ordered)

### Phase 1: Backend core (no UI)
1. Period breakdown helper (`finance_property_period_breakdown`)
2. Forward accrual function (`provenance_accrue_rent_charges`)
3. Update `provenance_balance_projection` to include `rent.charged`
4. Update `provenance_reconciliation_gate` with on-read accrual + new categories
5. Internal anchoring (table + RPCs)
6. `explain_property_balance` RPC (full response contract)
7. Internal alerts (observability + anomaly logging)
8. Backend tests

### Phase 2: UI
9. Explain Balance drawer component
10. Badge component
11. Export/print summary
12. Frontend tests

### Phase 3: Documentation + regression
13. Update provenance docs
14. Full regression suite

---

## 10. Risks and conscious decisions

| Decision | Rationale |
|---|---|
| Accrual continues past `lease_end_date` | Mirrors `finance_snapshot` which ignores `lease_end_date` |
| On-read accrual makes explain RPC a writer | Acceptable: idempotent, only fires at month boundaries |
| Rent change divergence spans snapshot | Correct: legacy reprices ALL months, not just post-cutover |
| No `provenance_chain_status` cache in 2B | `verify_provenance_chain` is called live per-explain; batch anchoring is the optimization |
| No tenancy-level explain in 2B | Legacy is property-based; tenancy-level would require robust lease→property mapping |
