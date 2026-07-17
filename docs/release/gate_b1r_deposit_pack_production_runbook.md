# Gate-B1R: Deposit Dispute Pack — Production Readiness Runbook

**Version:** gate_b1r_v3  
**Status:** Draft — not committed  
**Branch:** codex/hmrc-e1-hardening  
**Prepared:** 2026-07-15  
**Deposit release state at time of writing:** `internal_preview`

---

## 1. Scope

This runbook covers the support model, operational procedures and smoke-test plan for the Deposit Dispute Pack. It does not authorise the production transition. Nothing here is a substitute for explicit PO sign-off on the transition RPC call.

---

## 2. Entitlement Model

### 2.1 Access layers

| Layer | Mechanism | Enforced at |
|-------|-----------|-------------|
| Workspace (list, create, view, edit) | RLS: `user_can_manage_account` AND `deposit_pack_account_has_entitlement` | DB — cannot be bypassed by frontend |
| Export gate | `prepare_deposit_dispute_pack_export(pack_id)` RPC | DB SECURITY DEFINER |
| Release state check | Registry lookup inside export RPC: `release_state = 'production'` | Inside export RPC only |

All three conditions must hold for a production export to succeed. Workspace access is NOT gated on release state. Release state is enforced exclusively inside the export RPC.

### 2.2 `deposit_pack_account_has_entitlement`

Returns `true` for accounts whose effective plan rank is ≥ 2 (Growth or Pro). Starter (rank 1) returns false. Self-contained SECURITY DEFINER. Does not rely on `account_feature_required_plan('evidence_vault_dispute_pack')`, which falls through to `'starter'` — a pre-existing misconfiguration. The explicit Growth+ check is authoritative.

### 2.3 Root accounts

Root-role accounts pass the entitlement check regardless of plan. When a root user calls `prepare_deposit_dispute_pack_export` in `internal_preview` state, the export RPC bypasses the release state gate and succeeds. An authorisation row is written to `deposit_pack_export_authorisations` with the current `release_state` recorded as `internal_preview`.

There is no designated operator-preview UI or separately labelled preview output. Root accesses the same standard print page as any other user. The output is not labelled `internal_preview`. This is an RPC-level bypass, exercisable through the standard print flow.

**This is not a supported frontline or customer workflow.** Any requirement to preview a pack before the production transition must be escalated to engineering and treated as an operator-level action.

**Operational warning:** Because the output is not visibly labelled `internal_preview`, the root bypass must be used only in controlled engineering tests and must never be handed to a customer or represented as a production pack.

Root cannot export in `suspended` state — suspension blocks the export RPC for all callers including root (T-12).

### 2.4 Workspace-vs-export split

A Growth manager can create and view packs in the workspace while the registry is in `internal_preview`. They cannot export. T-17 proves both sides of this split.

---

## 3. Downgrade Consequence (Growth → Starter)

When an account downgrades from Growth to Starter:

- `deposit_pack_account_has_entitlement` returns `false`
- RLS on `deposit_dispute_packs` evaluates to `false` — workspace access is lost
- Records are **retained** in the database; they are not deleted
- Export RPC also fails the entitlement check (belt-and-suspenders)
- Any PDFs previously printed and saved are held solely by the user locally — Tenaqo cannot retrieve, revoke, relabel or withdraw those PDFs

**Support must not say:**
- "Your historical PDF can be downloaded from Tenaqo." — False.
- "Email us and we will send your PDF." — False.
- "We can revoke a PDF that has already been printed." — False.

**Correct guidance for downgraded users:** The records are retained. Moving to an eligible plan may restore workspace access under the entitlement policy in effect at that time. Tenaqo cannot retrieve PDFs previously saved through the browser.

---

## 4. Transition Matrix and Idempotency

From `gate_b1_deposit_release_registry.sql` (commit 2940d86):

| Current state | Allowed targets | All others |
|--------------|----------------|-----------|
| `internal_preview` | `production` | Rejected (P0408) — including direct `→ suspended` (T-05) |
| `production` | `suspended` | Rejected |
| `suspended` | `internal_preview`, `production` | Rejected |

**Idempotency:** Same `(pack_type, release_reference, new_state)` triple → success, no duplicate row.  
**Conflict:** Same `release_reference`, different `new_state` → P0406.

---

## 5. Suspension Procedure

### 5.1 What suspension is and is not

Suspension blocks new production export authorisations. It is distinct from a plan downgrade:

- An entitled user **retains workspace access** while export is suspended
- Suspension does not delete or relabel workspace records
- Suspension does not change prior authorisation events already written to `deposit_pack_export_authorisations`
- PDFs the user has already printed or saved are held locally — outside Tenaqo's control

### 5.2 When to suspend

- Critical defect in export output or authorisation logic
- Data integrity concern in pack assembly
- Governance requires a pause pending remediation

### 5.3 Executing a suspension

Requires a root-role session. Root or operator engineering only — frontline support must not execute this.

```sql
SELECT transition_deposit_pack_release_state(
  'deposit_dispute_pack',
  'suspended',
  'suspension-<YYYYMMDD>-<reason-slug>',
  '<Rationale: what is being investigated or fixed>',
  'gate_b1_v1'
);
```

Verify the return value. The suspension takes effect when the function returns.

### 5.4 Recovery paths

**Resume production:**
```sql
SELECT transition_deposit_pack_release_state(
  'deposit_dispute_pack', 'production',
  'resume-<YYYYMMDD>-<slug>', '<Rationale>', 'gate_b1_v1'
);
```

**Roll back to internal_preview:**
```sql
SELECT transition_deposit_pack_release_state(
  'deposit_dispute_pack', 'internal_preview',
  'rollback-<YYYYMMDD>-<slug>', '<Rationale>', 'gate_b1_v1'
);
```

### 5.5 Rehearsal requirement

Do not rehearse suspension in production without explicit operational approval. A production suspension blocks all new exports for all entitled customers for its duration. Rehearse in staging first.

---

## 6. Legacy Record Classification

Packs with `pack_version = NULL` are classified dynamically as `pre_gate_b` by the export RPC. This is metadata only — it does not block the export.

---

## 7. Export Semantics

### 7.1 What Tenaqo records

On authorisation, the export RPC inserts a row into `deposit_pack_export_authorisations` containing: pack ID, authorising user, authorisation timestamp, release state at time, and pack version classification.

### 7.2 What Tenaqo can and cannot assert

**Can assert:** server issued an authorisation, durable record was written, `window.print()` was invoked.

**Cannot assert:** OS print dialog completed, user clicked Print, PDF was saved, physical page was printed.

### 7.3 Export event terminology

**Support may say:**

> "Tenaqo recorded that the print flow was authorised and initiated."

**Support must not say:** downloaded · saved · completed · PDF retrieved · print succeeded.

These describe outcomes that occur outside Tenaqo's custody and for which Tenaqo has no record.

### 7.4 PDF storage

Tenaqo does not store the generated PDF. It is produced by the user's browser at print time and held solely by the user.

---

## 8. Support Escalation Tiers

### 8.1 Scope boundary

**Frontline support must not query or mutate production release tables.**

**Frontline collects:**
- Account identifier
- Pack ID (if available from the user)
- Time the issue occurred
- Visible error message — exact text; instruct user to copy it
- Current plan, confirmed via approved support tooling only

**Root/operator engineering may inspect:**
- `deposit_pack_release_registry` (current release state)
- `deposit_pack_release_transitions` (state change log)
- `deposit_pack_export_authorisations` (export event log)

Do not include customer-identifying details in internal escalation summaries beyond what is needed to identify the specific record.

### 8.2 Tier 1 — First response

| Scenario | Response |
|----------|----------|
| "I can't see the Deposit Dispute Pack section" | Workspace requires a Growth or Pro plan. Starter does not include Deposit Dispute Packs. |
| "I can see the workspace but print shows an error" | Collect exact error text, account and time. Escalate to Tier 2 if account is Growth or Pro. |
| "I downgraded and lost access to my packs" | The records are retained. Moving to an eligible plan may restore workspace access under the entitlement policy in effect at that time. Tenaqo cannot retrieve PDFs previously saved through the browser. |
| "I want a copy of a PDF I printed" | Tenaqo does not store PDFs. The pack can be re-generated after moving to an eligible plan, once production export is available. |
| "Did my export succeed / was my PDF saved?" | Tenaqo recorded that the print flow was authorised and initiated. Whether the PDF was saved is determined by what the user did in their browser's print dialog — Tenaqo has no record of that. |

> **Note on imported compliance records:** Imported compliance records are not currently included in the Deposit Dispute Pack. The pack uses native inspection reports and linked evidence. None of the current pack paths includes data from compliance import batches. If a future pack version adds imported compliance data, the attested-import source label and verification boundary must be preserved in both the screen and print output. Do not tell a customer that imported compliance rows appear in this pack today.

### 8.3 Tier 2 — Internal escalation (root/operator engineering)

| Scenario | Action |
|----------|--------|
| Growth user reports export blocked, no clear error | Inspect `deposit_pack_release_registry`. If `internal_preview`, production transition not yet complete — inform support. |
| Root user reports export blocked | Verify registry state. `suspended` state blocks all callers including root. `internal_preview` allows root but blocks all other users. Confirm which state is in effect. |
| Request to run an operator preview before production transition | Root can call `prepare_deposit_dispute_pack_export` directly; this writes an audit row with `release_state = internal_preview`. There is no designated operator UI. Treat as an engineering task, not a frontline procedure. |
| Suspected cross-account data exposure | P1 escalate to engineering immediately. Reference T-14. |
| Entitlement dispute — Growth user still blocked | Confirm `deposit_pack_account_has_entitlement` for the account UUID. Confirm plan rank ≥ 2. |

---

## 9. Deploy-to-Transition Window Risk

### 9.1 The actual risk

Deploying the Gate-B1 application while the Deposit release registry remains `internal_preview` will cause customer production export attempts to be denied. Workspace access for entitled users remains available. The denial continues until a root-authorised move to `production` is executed.

This is an **export interruption window** — not a service outage, but Growth customers who attempt to print a Deposit Dispute Pack during this window will see an authorisation error.

### 9.2 Required pre-deployment checks

Before deploying to a live environment, an authorised operator must verify the following. Do not include customer-identifying details in the returned evidence.

**Check 1 — Entitled live accounts**  
Count accounts currently on Growth or Pro plan with active status.

**Check 2 — Existing pack records**  
Count existing Deposit Dispute Pack workspace records; identify whether any are associated with active tenancies or show recent activity.

**Check 3 — Recent export activity**  
Check available evidence of print use — including legacy export rows written before Gate-B1.

**Check 4 — Known customer or pilot dependency**  
Check support records, pilot notes and account history for any account known to be relying on the Deposit Dispute Pack print path.

### 9.3 Decision matrix

| Finding | Action |
|---------|--------|
| No active dependency | Deploy and execute the production transition in one controlled window |
| Active dependency confirmed | Communicate the export interruption in advance, or deploy and transition in a tightly controlled window that minimises the gap |
| Usage unknown | Do not deploy until usage is resolved |

---

## 10. Help Centre Copy Changes

### 10.1 Applied now

**`plans-and-limits` — Starter**

Removed the unqualified "evidence packs" reference that implied Starter includes Deposit Dispute Packs.

Before: `"…spreadsheet import and evidence packs."`  
After: `"…spreadsheet import, maintenance evidence packs and compliance evidence packs."`

**`evidence-packs` — "Accessing your packs"**

Replaced a single undifferentiated paragraph with four paragraphs. The first establishes that availability varies. The second and third cover Maintenance and Compliance packs respectively, using workflow-scoped language that does not make plan-gate claims Tenaqo cannot currently support. The fourth states the Deposit Dispute Pack requirement explicitly.

Before:
```
"Evidence Packs are available in the Documents section of the product. You can generate a pack
for any active or ended tenancy at any time. The pack is generated from the records available
at that moment."
```

After:
```
"Evidence-pack availability depends on the pack type, your account plan and the relevant workflow."

"Maintenance Evidence Packs are generated from completed maintenance jobs and are available
through supported maintenance workflows."

"Compliance Proof Packs are available through eligible Renters' Rights workflows."

"Deposit Dispute Packs require a Growth or Pro plan. They are available in the Documents
section and can be generated for any tenancy. The pack is assembled from the records available
at the time of generation."
```

The previous v2 wording described Compliance and Maintenance as having "no plan gate." That characterisation was removed because:
- Compliance Proof Pack access is effectively plan-gated through the Renters' Rights surface
- The RPC lacks its own server-side plan check (a Gate-B2 defect, not intended availability)
- Publishing "no plan gate" as a feature description would expose an implementation gap as product entitlement

### 10.2 Update at production transition

**`plans-and-limits` — Growth:** add `", and Deposit Dispute Pack"` to Growth description.

**`evidence-packs` — additional paragraph in "Accessing your packs":**
```
"When you click Print on a Deposit Dispute Pack, Tenaqo performs a server-side authorisation
check before the print dialog opens. If the check fails, an error is shown and no dialog opens.
Tenaqo does not store the generated PDF — it is produced by your browser at print time. If you
save or print the PDF, that file is held by you."
```

---

## 11. Smoke-Test Plan

### 11.1 Stage A — Pre-transition, `internal_preview` (executable now)

```
node scripts/with-local-node.mjs vitest run --config vitest.integration.config.js \
  tests/integration/gate_b1_deposit_release_registry.test.js
```

| # | Description | Test |
|---|-------------|------|
| A-01 | Registry at `internal_preview` | T-03 |
| A-02 | Growth entitlement passes Growth account | T-01 |
| A-03 | Growth entitlement passes root | T-02 |
| A-04 | Non-root cannot transition state (P0401) | T-04 |
| A-05 | Invalid step rejected | T-05 |
| A-06 | Growth manager workspace SELECT succeeds | T-17 (first half) |
| A-07 | Growth manager export RPC denied | T-17 (second half) |
| A-08 | Non-root export denied | T-06 |
| A-09 | Root export allowed in `internal_preview`; audit row written | T-07 |
| A-10 | Cross-account scope isolation | T-14 |
| A-11 (manual) | Export button shows error; `window.print()` not called | Manual UI |
| A-12 (manual) | Error copy non-empty and user-readable | Manual UI |

### 11.2 Stage B — Post-transition (plan only; requires separate PO approval; staging first)

B-01 Registry shows `production` · B-02 Growth export succeeds, authorisation row inserted · B-03 `window.print()` called · B-04 `print_initiated` event recorded · B-05 Root can export · B-06 Tenants denied (P0401) · B-07 Cross-account denied · B-08 Null `pack_version` → `pre_gate_b` · B-09 Suspend succeeds · B-10/B-11 Export blocked for Growth and root in suspended · B-12 Resume restores export · B-13 Idempotent transition · B-14 Conflicting reference → P0406

---

## 12. Proof and Non-Proof Statement

**Proved (T-01 through T-17):** Growth+ entitlement at DB boundary; registry seeds at `internal_preview`; non-root blocked from state machine; invalid transitions rejected; workspace survives for Growth in `internal_preview`; export denied/allowed per role; production-state rules; suspended blocks all including root; RLS scope isolation; static — silent catch removed, old RPC name absent.

**Not proved:** OS print dialog completion; PDF save; browser rendering; legal admissibility; attested-import accuracy in packs; Stage B (not executed).

---

## 13. Status Confirmation

| Item | Value |
|------|-------|
| Transition RPC invoked | No |
| Deposit release state | `internal_preview` — unchanged |
| Files created | `docs/release/gate_b1r_deposit_pack_production_runbook.md` (untracked, not staged) |
| Files modified | `marketing-site/content/help.ts` (three now-edits, not staged) |
| Staged | Nothing |
| Committed | Nothing |
| Gate-B2 begun | No |
