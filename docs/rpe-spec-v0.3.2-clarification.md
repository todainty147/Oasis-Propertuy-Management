# Regulatory Proof Engine — Specification v0.3.2 Clarification

**Status:** Ratified clarification-only update  
**Ratification date:** 26 June 2026  
**Supersedes:** RPE Spec v0.3.1 for interpretive wording only  
**Scope:** RRA Information Sheet Proof Pack, Section-B prerequisites and contract-test reporting

## Purpose

RPE Spec v0.3.2 is a clarification-only update. It does not introduce new
captured inputs, new legal rules, new obligation states, new schema
requirements, or VS-2 behaviour.

It ratifies behaviours already proven through Section A and B-prereq-1 through
B-prereq-4:

- provenance integrity and first live evaluation write;
- jurisdiction read;
- active-on-date / time-qualified periodic indicator;
- Tier-4 exclusions, first affected result, and exposure ceiling;
- first-class `aod_branch` reporting.

## Clarifications

### 1. `aod_branch` is first-class reporting

Every RRA information-sheet evaluation report must expose an `aod_branch` value
from the following closed set:

```text
known_end_date
time_qualified_periodic_indicator
missing
not_reached
```

The branch describes how `active_on_qualifying_date` was resolved, or why that
input was not reached.

### 2. `aod_branch` is orthogonal to `result`

`aod_branch` must not be collapsed into the final legal disposition.

Examples:

- A Wales jurisdiction exclusion has `result = not_affected` and
  `aod_branch = not_reached`.
- A company-let or Rent Act exclusion that first resolved active-on-date through
  a known end date has `result = not_affected` and
  `aod_branch = known_end_date`.
- A tenancy that cannot resolve active-on-date has `result = needs_data` and
  `aod_branch = missing`.

Two evaluations with the same `result` may therefore have different
`aod_branch` values.

### 3. `aod_branch` is derived/reporting output, not a captured input

`aod_branch` is derived from the classified input snapshot and decision path. It
is not evidence and must not be captured as a source fact.

`aod_branch` must not be added to:

- VS-0 classified input objects;
- `input_snapshot`;
- the `inputSnapshotHash` payload;
- possession, lease, property, tenant, account, document, or task source data.

The same factual `input_snapshot` must produce the same `inputSnapshotHash`
before and after this clarification. If adding or changing `aod_branch` changes
the snapshot hash, the implementation is wrong.

### 4. Present firing exclusions short-circuit

If an exclusion can be conclusively decided from a present admissible field, the
engine must return the relevant terminal `not_affected` result immediately.

Missing downstream fields must not override an already-proved exclusion.

Example:

```text
company_let = true
tenancy_class = null
resident_landlord = null
pbsa = null
is_wholly_oral = null

=> not_affected[EXCL_CLASS_COMPANY_LET]
```

This is not a completeness failure. The proved exclusion is terminal.

### 5. Completeness collects all reachable missing mandatory inputs

Completeness is different from exclusion short-circuiting.

Once no present exclusion has fired and the evaluation reaches a completeness
surface, the engine should return every reachable missing mandatory input needed
to continue from that point, not merely the first missing field.

Example:

```text
company_let = null
resident_landlord = false
rent_act_1977 = false
pbsa = false
tenancy_class = assured_shorthold
is_wholly_oral = null

=> needs_data[company_let, is_wholly_oral]
```

This keeps capture-flow output useful: the operator can collect the full
reachable gap rather than discovering one missing field per re-run.

### 6. Contract/report aggregation must use fresh recorded evaluations

Section-B closure and the full A/B/C/D + C-bad contract test must aggregate from
fresh recorded evaluations for the target leases.

Reports must not treat stale or absent rows as evidence of current behaviour.
For each target case, the report must confirm:

```text
recorded_evaluation_id is not null
evaluation_run_event_exists = true
demo_mode = true
expected branch/result matches actual branch/result
```

Where a target lease has no recorded row, the required action is to run and
record that lease through the RPE diagnostic surface or equivalent authorised
RPC path, then re-run the report.

## Contract-test aggregation buckets

The full A/B/C/D + C-bad contract test must report the split using recorded
evaluations:

```text
B-shaped / evaluable:
  known_end_date
  time_qualified_periodic_indicator

C-shaped / needs capture:
  missing

Disposed before active-on-date:
  not_reached
```

It must also aggregate final evaluation results:

```text
affected
not_affected
needs_data
deferred
```

This split determines whether VS-2 should open on exposure cards or on
data-capture flow.

## Non-changes

v0.3.2 does not:

- open VS-2;
- create `obligation_instance`;
- change the RRA legal predicate;
- add new rule inputs;
- make demo-mode evaluations customer-facing;
- alter the provenance hash-chain field set;
- change `inputSnapshotHash` semantics.

