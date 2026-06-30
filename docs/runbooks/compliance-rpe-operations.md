# Compliance / Regulatory Proof Engine Operations Runbook

## Purpose

The Regulatory Proof Engine evaluates reviewed regulatory inputs into evidence states, obligation instances, service/discharge evidence, and proof packs. Demo-mode proof packs are not legal sign-off.

## Scope and current status

RPE and proof pack work is demo-gated until Gate-B/product sign-off says otherwise. Customer-facing proof packs must preserve caveats and traceability.

## Critical invariants

- Only reviewed regulatory changes and approved impact rules feed the engine.
- Missing mandatory facts produce `needs_data`, not silent assumptions.
- Exclusions short-circuit only when proved from admissible fields.
- Obligations move through reconciliation and discharge RPCs, not operational task writes.
- Proof packs must show traceable evidence, not unsupported conclusions.

## Key files

- `src/lib/regulatoryDataReadiness.js`
- `src/lib/regulatoryProofEngine.js`
- `src/services/regulatoryProofEngineService.js`
- `src/pages/compliance/RpeDiagnosticPage.jsx`
- `src/pages/compliance/RentersRightsProofPackPage.jsx`
- `src/components/compliance/ObligationProofPackPanel.jsx`
- `src/utils/proofPackPdfExport.js`
- `supabase/regulatory_proof_engine_*.sql`
- `docs/rpe-spec-v0.3.2-clarification.md`
- `docs/regulatory-proof-engine-input-coverage-audit.md`

## Data model / RPCs / functions

Core objects include `regulatory_change`, `impact_rule`, rule evaluations, obligations, service evidence, discharge evidence, basis review flags, proof pack read models, and provenance events.

## Normal operation

1. Reviewed change and approved rule exist.
2. Data readiness classifies inputs.
3. Evaluation records `affected`, `not_affected`, `deferred`, or `needs_data`.
4. Reconciliation creates or updates obligation posture.
5. Service evidence can discharge an open obligation through admissible evidence.
6. Proof pack read model assembles the trace.

## Common failure modes

- `needs_data`: required input is missing or inadmissible.
- `not_affected`: a proved exclusion fired.
- Open obligation not created: evaluation may be stale, not affected, or demo-gate blocked.
- Discharge rejected: official artefact or service evidence is incomplete.
- Basis changed after discharge: review flag should be visible, not silently erased.
- Proof pack trace incomplete: evidence, evaluation, or obligation linkage missing.

## Triage checklist

1. Confirm account, tenancy, property, rule id/version, and latest recorded evaluation.
2. Inspect readiness map for inadmissible or missing fields.
3. Confirm evaluation provenance event and input snapshot hash.
4. Read obligation posture and transition events.
5. Read service evidence and proof pack assembly output.

## Safe operator actions

- Ask users to complete capture tasks for missing fields.
- Re-run demo evaluation through the supported diagnostic surface.
- Export proof pack for engineering review.

## Unsafe actions / never do

- Do not manually set evaluation result, obligation posture, discharge state, or proof pack facts.
- Do not tell a customer the system has removed all legal risk.
- Do not bypass Gate A/Gate B or demo-mode warnings.

## Customer-safe wording

“The proof pack shows the evidence state Tenaqo can trace from reviewed rules and recorded data. Items marked review-required need human review before being relied on.”

## Escalation

Escalate for inconsistent evaluation results, missing provenance events, cross-account reads, proof pack traces with missing evidence, or any posture movement outside reconciliation/discharge RPCs.

## Recovery / rollback notes

Use capture and re-evaluation flows. Preserve prior evaluations and transitions; do not overwrite history.

## Verification after fix

- Latest evaluation id is fresh.
- Obligation posture is consistent with latest evaluation and evidence.
- Proof pack includes source rule, input snapshot, obligation, evidence, and caveats.

## Related tests

- `tests/security/regulatoryDataReadinessContracts.test.js`
- `tests/security/regulatoryProofEngineContracts.test.js`
- RPE proof pack/security/e2e tests.
