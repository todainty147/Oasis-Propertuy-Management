# Regulatory Proof Engine Input Coverage Audit

**Audit date:** 23 June 2026  
**Scope:** Vertical Slice 1 — Renters' Rights Information Sheet  
**Result:** `READY_WITH_CAPTURE_FLOW`

## Executive conclusion

Tenaqo currently has a task tracker and a document/provenance evidence
substrate, but it does not yet have a complete regulatory proof engine.

The generic engine relations named in the proposed design do not exist:

- `regulatory_change`
- `impact_rule`
- `rule_evaluation`
- `obligation_instance`

The current implementation instead uses `renters_rights_tasks`, `leases`,
`tenants`, `properties`, `accounts`, `documents`,
`tenancy_compliance_items`, and `provenance_events`.

Of 23 required rule inputs:

| Category | Count |
|---|---:|
| Exists | 7 |
| Derivable | 3 |
| Missing | 13 |
| **Total** | **23** |

**Coverage:** `(7 + 3) / 23 = 43.5%`

The missing inputs have reasonable capture paths. VS-1 may therefore proceed
only with `affected`, `not_affected`, `deferred`, and `needs_data` as explicit
states. It must not collapse unknown legal facts into `affected`,
`not_affected`, or `compliant`.

## Classification rules

- **EXISTS:** explicitly persisted in a structured field.
- **DERIVABLE:** deterministically computable from persisted structured fields.
- **MISSING:** not available with near-100% confidence. Defaults, free text,
  filenames, account-level assumptions, and unrelated notice fields do not
  count as proof.

An input classified as EXISTS or DERIVABLE can still be absent on an individual
record because several source columns are nullable. Such a record must evaluate
to `needs_data` unless an earlier provable exclusion disposes of the case.

## Complete input matrix

| Rule input | Source table / field | Exists | Derivable | Missing | Notes |
|---|---|:---:|:---:|:---:|---|
| Versioned regulatory change and rule definition | None |  |  | ✓ | No `regulatory_change` or `impact_rule` relation. Dates currently appear as code constants or task defaults, not versioned regulatory evidence. |
| Qualifying / commencement date | None |  |  | ✓ | `2026-05-01` appears in existing renters-rights SQL and documentation, but is not stored in a versioned rule record. |
| Tenancy exists | `leases.id` | ✓ |  |  | A lease is the tenancy record. Current information-sheet tasks may have a null `lease_id`, so task-to-tenancy linkage is not guaranteed. |
| Tenancy start date | `leases.lease_start_date`, legacy `leases.start_date` | ✓ |  |  | Both fields are nullable and their precedence is not schema-enforced. Missing or conflicting values require `needs_data`. |
| Tenancy end date | `leases.lease_end_date`, legacy `leases.end_date` | ✓ |  |  | Both fields are nullable. Null must not automatically be treated as proof of an ongoing tenancy without an explicit semantic contract. |
| Active on qualifying date | Tenancy start/end dates plus qualifying date |  | ✓ |  | Deterministic only when the authoritative dates and qualifying date are known. `renewal_status` is current state, not historical proof of status on a past date. |
| Property is in England | None |  |  | ✓ | `accounts.country_code = 'GB'` is account-scoped and GB is not England. `properties.market = 'uk'` is also not England. `renters_rights_tasks.jurisdiction` is hardcoded to `GB-ENG`, so it is an assumption rather than property evidence. |
| Annual rent | `leases.rent_amount`, `leases.rent_frequency` |  | ✓ |  | Deterministic for a recognised frequency when both values are present. `properties.rent` is not a safe substitute where lease rent is unknown or conflicting. |
| Company let | None |  |  | ✓ | Tenant name/email do not prove whether the contracting tenant is a company. |
| Resident landlord / lodger arrangement | None |  |  | ✓ | No structured occupancy or resident-landlord classification exists. |
| Rent Act 1977 tenancy | None |  |  | ✓ | `leases.lease_type` contains Polish classifications only and cannot represent this UK statutory regime. |
| Excluded PBSA | None |  |  | ✓ | No property/accommodation classification or PBSA exclusion field exists. |
| Section 21 served timestamp | None |  |  | ✓ | No possession-notice entity or notice-type field exists. `rent_plans.notice_served_at` concerns rent-change notices and must not be reused. |
| Section 8 served timestamp | None |  |  | ✓ | Same gap as Section 21. A document filename or free-text note is not deterministic evidence. |
| Notice cutoff date | None |  |  | ✓ | No versioned rule field stores the cutoff against which Section 8/21 service is compared. |
| Proceedings concluded | None |  |  | ✓ | No possession proceeding or court-case lifecycle field exists. |
| Official information-sheet identity and version | None |  |  | ✓ | A task can link any `documents.id`; document tags do not identify the official sheet, and no source version/hash proves the exact GOV.UK artefact. |
| Information sheet marked as served | `renters_rights_tasks.status`, `sent_at`, `delivery_method` | ✓ |  |  | This records a manager assertion. It does not by itself prove that the correct document was served or that service was legally effective. |
| Service evidence exists | Task document link and/or qualifying document provenance event |  | ✓ |  | Can be derived from `document_id` or service provenance events, provided the evidence is linked to the correct tenancy, recipient, and official document. Current workflows do not guarantee all such events are written. |
| Evidence timestamp | `renters_rights_tasks.sent_at`; `provenance_events.occurred_at`, `recorded_at` | ✓ |  |  | The timestamp exists structurally, but its evidential strength depends on whether it is a manual assertion, system event, or delivery confirmation. |
| Deadline date | `renters_rights_tasks.due_date` | ✓ |  |  | Persisted per task, currently defaulting to `2026-05-31`; it is not linked to a versioned regulatory source. |
| Current operational compliance state | `renters_rights_tasks.status` | ✓ |  |  | Existing vocabulary is task-oriented (`required`, `sent`, etc.), not an engine outcome. It must not be presented as a legal compliance conclusion. |
| Persisted evaluation / obligation outcome | None |  |  | ✓ | No `rule_evaluation` or `obligation_instance` relation stores `affected`, `not_affected`, `deferred`, `needs_data`, evaluated inputs, rule version, or rationale. |

## Mandatory missing inputs and capture requirements

All missing fields in the current rule set are mandatory, although some are
conditionally mandatory only after earlier rules have not already produced a
conclusive result.

| Field | Why needed | Capture location | Required? |
|---|---|---|:---:|
| Regulatory change/rule version | Reproducible evaluation and audit trail | Controlled regulatory catalogue | Yes |
| Qualifying date | Active-on-date inclusion test | Regulatory catalogue | Yes |
| Property country and UK subdivision | England-only jurisdiction test | Property setup/edit workflow | Yes |
| Contracting tenant legal-person type | Company-let exclusion | Tenancy parties workflow | Yes |
| Resident-landlord/lodger arrangement | Resident-landlord exclusion | Tenancy setup/review | Yes |
| Statutory tenancy regime | Rent Act 1977 exclusion | Tenancy setup/review, with “unknown” available | Yes |
| PBSA/excluded accommodation classification | PBSA exclusion | Property and tenancy setup/review | Yes |
| Section 21 service timestamp and evidence | Pre-cutoff deferral test | Possession notice workflow | Conditional yes |
| Section 8 service timestamp and evidence | Pre-cutoff deferral test | Possession notice workflow | Conditional yes |
| Notice cutoff date | Compare notice service with the applicable rule | Regulatory catalogue | Yes |
| Proceedings conclusion status/date | Resolve deferral state | Possession/court proceeding workflow | Conditional yes |
| Official information-sheet identifier/version/hash | Prove which document was served | Controlled document catalogue/template registry | Yes |
| Evaluation and obligation record | Persist outcome, rationale, missing inputs, rule version, and deadline | Regulatory engine output | Yes |

No listed missing input is safely an optional enhancement for a proof engine.
Secondary provider metadata may improve evidence strength, but it is outside the
minimum rule-input count above.

## Required runtime behaviour

1. Evaluate deterministic, provable exclusions first.
2. Stop as soon as an exclusion conclusively produces `not_affected`.
3. Do not request facts that cannot change that concluded result.
4. If no conclusive exclusion applies and a mandatory fact is absent, return
   `needs_data` and create a targeted data-capture task.
5. Return `deferred` only when a qualifying notice/proceeding state is proved.
6. Return `affected` only after inclusion, jurisdiction, and every applicable
   exclusion/deferral input are known.
7. Treat `sent`, `evidence_uploaded`, and `reviewed` as operational task states,
   not legal conclusions.

Examples:

- A property explicitly recorded as Wales is immediately `not_affected`. Do not
  request rent, tenancy classification, resident-landlord status, or possession
  data.
- If England is proved and annual rent is unknown, return `needs_data`.
- If annual rent is proved above £100,000, return `not_affected` without
  requesting the remaining exclusion fields.
- A linked document without a controlled official-sheet identity is not enough
  to prove that the required information sheet was served.

## Permanent design rule

> Regulatory engines must evaluate provable exclusions before completeness
> checks whenever an exclusion can be decided from evidence already present.
> Missing information must never override an already-proved exclusion, and
> unknown mandatory information must never be silently treated as false.

## Final recommendation

### `READY_WITH_CAPTURE_FLOW`

The missing facts are practical to collect through guided property, tenancy,
possession, and controlled-document workflows. VS-1 should launch only with:

- `affected`
- `not_affected`
- `deferred`
- `needs_data`

This recommendation does **not** mean the current task tracker is ready to make
binary legal-compliance determinations. Building additional substantive rules
should remain blocked until the mandatory capture model and versioned evaluation
record are designed.
