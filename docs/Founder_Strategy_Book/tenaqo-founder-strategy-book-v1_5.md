# Tenaqo — Founder Strategy Book
**Edition v1.4 · 2 July 2026 · Maintained by: Oasis**

*The institutional memory of Tenaqo: what we believe, how we resolve conflicts between those beliefs, why we made the choices we made, and how all of that becomes code.*

---

## How to read this book

- **The Constitution** tells us *what we believe.* It is almost immutable.
- **The Tension Registry** tells us *how we resolve conflicts between those beliefs.* It is living.
- **The Decision Registry** tells us *why major choices were made.* Decisions are contingent and reversible.
- **Specifications** describe *one implementation* of those beliefs and decisions. They change often.
- **The code** is *the current implementation.*

**On source of truth.** The Constitution is the source of truth for what Tenaqo *should be*. The code is the source of truth for what Tenaqo *currently is*. When the two disagree, that is not the code being "wrong" — it is a **drift signal**, information telling you where implementation has diverged from philosophy. Read it; don't dismiss it. Then close the gap in whichever direction the Constitution and reality jointly require.

### The document hierarchy

```
        Constitution            (Layer 1 — almost immutable)
              ↓
        Tension Registry        (Layer 2 — living)
              ↓
        Specifications          (Layer 3 — change often)
              ↓
        Implementation (code)
              ↓
        Tests
```

The *rate of change* is itself governed. If a layer changes faster than the layer above it permits, that is a governance failure, not progress. Constitutional articles do not change at spec speed; if they did, they would not be constitutional.

---

## Preamble

The Constitution exists to preserve Tenaqo's philosophy as the platform evolves.

Features will change. Markets will expand. Regulations will evolve. Technologies will come and go.

These principles exist so that the *reasons* behind Tenaqo's decisions remain consistent — regardless of who builds the software, or when. This is not a style guide. It is the foundation the product is built on. Read it before you read a line of code.

---

# Part 1 — The Constitution

## Amendment & governance

1. **Three layers, three speeds.** The Constitution (Layer 1) is almost immutable. The Tension Registry (Layer 2) is living. Specifications (Layer 3) are disposable. Each may only change at its own speed.

2. **Amending the Constitution is rare and deliberate.** A change to any of the nine Articles requires explicit founder sign-off and a recorded rationale in the Decision Registry. If principles are being rewritten every few months, they are not constitutional — they are specs wearing a crown.

3. **No specification may permanently resolve a constitutional tension on its own.** If implementation reveals a conflict between principles that is not already recorded in the Tension Registry, the work **pauses** long enough to add the tension and its resolution to the Registry before proceeding. A spec may *apply* a resolution; it may never *invent* one unilaterally and move on.

## The nine Articles

### Principle #1 — Trust is our primary product
Every feature should increase confidence that the platform is telling the truth. Convenience never comes before trust.

### Principle #2 — Evidence beats opinion
Assertions are backed by evidence. Where evidence cannot be established, the platform should say so rather than imply certainty.

### Principle #3 — Every important decision must be explainable
Users should understand not only *what* Tenaqo recommends, but *why*. AI, compliance, finance and operational decisions must always be explainable.

### Principle #4 — Technology should reduce cognitive load
The platform exists to answer: *"What needs my attention today?"* It should reduce operational complexity, not add dashboards and noise.

### Principle #5 — Integrate before you replace
Respect customers' existing investments. Connect to specialist systems first. Replace them only if customers later choose to consolidate into Tenaqo.

### Principle #6 — Compliance should be proactive, not reactive
Don't merely record that something became non-compliant. Predict it. Warn about it. Guide the user before it becomes a problem.
*(How predictions must be presented is governed by Tension Registry entry T-02 — a forecast is never shown as an established fact.)*

### Principle #7 — The platform should make consequential mistakes difficult
Safety boundaries belong in code, not documentation. Server-side enforcement. Explicit confirmations. Auditability. Guardrails before automation.

### Principle #8 — Every module strengthens the Operating System
No feature exists in isolation — maintenance, finance, compliance, documents, tax, AI. Every module must contribute to a single operational picture rather than becoming a standalone product.

### Principle #9 — Never infer jurisdiction
Jurisdiction determines legal obligations. Language, nationality, user preference and account locale are never substitutes. Every legal recommendation must resolve against an explicit jurisdiction before it is presented or applied.
*(Worked example: the* Jurisdiction Safety Guardrail *spec is the first implementation of this Article — the canonical demonstration of Constitution → Specification → Code.)*

---

# Part 2 — Tension Registry *(living)*

Principles are absolutes individually; together they sometimes pull against each other. This registry records each known tension and the agreed resolution, so the conflict is settled *once*, consistently, rather than re-litigated per spec. Per the governance rule above, any newly discovered tension is added here before the spec that surfaced it may proceed.

### T-01 · #5 Integrate before you replace ↔ #8 Every module strengthens the OS
**The tension.** Integration respects external systems but yields weaker, second-hand data; OS coherence wants native data with a single source of truth and strong provenance. Data living in PayProp via a thin sync does not strengthen the OS the way native data does.

**Resolution — sequence, don't choose.** Integrate first to lower adoption friction and win the customer (#5). Earn the right to become the source of truth for a domain (#8) only when the customer *chooses* to consolidate — never by force. Imported provenance is **attested custody from the moment of import**, structurally weaker than native cryptographic provenance, and must always be represented as such, never as equivalent. The connected state is treated as a durable end-state, not merely a waypoint to replacement.

**Precedence.** Neither is absolute; the sequence resolves them. Where they cannot be sequenced, **#1 (Trust)** is the tiebreaker.

### T-02 · #6 Compliance should be proactive ↔ #2 Evidence beats opinion & #9 Never infer
**The tension.** A prediction is, by nature, not yet evidenced — it is an inference about the future. #6 asks Tenaqo to warn early; #2 and #9 forbid presenting inference as established fact.

**Resolution.** Evidence supports what is *true now*; a prediction *estimates what is likely to become true, based on evidence*. Proactive warnings are permitted, but only as forecasts **grounded in stated facts and labelled as forecasts** — never asserted as settled fact.
- Allowed (fact): *"Your EPC expires in 19 days."*
- Allowed (labelled forecast, basis shown): *"Based on the current schedule, this obligation is expected to become overdue in 7 days."*
- Forbidden (inference as fact): *"You will be non-compliant."*

**Precedence.** #6 defers to #2 on *how* a prediction is presented. When a proactive warning cannot be grounded in stated facts, it is not shown. **#2 wins.**

---

# Part 3 — Decision Registry

Not every important choice is a principle or a tension. Strategic decisions are **contingent** — made under specific conditions, and reversible when those conditions change. This registry preserves them so a future reader knows *why* a path was taken, and *when* it would be right to revisit. Each entry: decision, date, rationale, status, revisit-when.

### D-01 · Integrate before replacing specialist systems
- **Decision.** Connect to PayProp, Fixflo, Xero, Open Banking et al. as the operational-intelligence layer; replace only on customer choice.
- **Date.** June 2026. **Applies:** Principle #5.
- **Rationale.** Lowers adoption friction; respects existing investments; lets Tenaqo reason across systems before it owns them.
- **Status.** Active.
- **Revisit when.** A specialist's API becomes adversarial or is revoked, or customers consistently ask to consolidate a domain natively.

### D-02 · ICP = small & medium UK landlords and operators, UK-first
- **Decision.** Target small-to-medium landlords and operators; United Kingdom as the first and primary market.
- **Date.** June 2026.
- **Rationale.** NRLA distribution (100k+ members); Renters' Rights Act regulatory tailwind; the compliance/evidence/provenance moat is strongest and most defensible in the UK.
- **Status.** Active.
- **Revisit when.** Traction data shows a different segment converting, or a second jurisdiction reaches production-readiness.

### D-03 · NRLA — pursue Recognised Supplier status, not the advertising tier
- **Decision.** Treat the Recognised Supplier / partner route (via NRLA Commercial Services) as the strategic target; the committed low-tier banner is a relationship foot-in-the-door, not the goal.
- **Date.** June 2026.
- **Rationale.** Supplier status transfers association trust to a pre-live product; advertising is un-endorsed rented attention NRLA's own site disclaims. NRLA is actively recruiting compliance-tech suppliers (e.g. ResiSure).
- **Status.** In progress — supplier-route enquiry to be sent.
- **Revisit when.** Vetting requires production-readiness Tenaqo can't yet meet, or the contact's remit proves purely commercial (escalate to Commercial Services directly).

### D-04 · Multi-market sequencing — UK depth-first, jurisdictions never in parallel
- **Decision.** Go deep on UK compliance first; build other jurisdictions (PL, DE) behind locale-gating until production-ready; never run two immature jurisdictions in parallel.
- **Date.** June 2026.
- **Rationale.** Compliance is jurisdiction-locked, the hardest and highest-liability work, and doesn't travel. One trusted engine beats two half-built ones. (The operational layer is jurisdiction-agnostic and ports freely; only compliance must be rebuilt per market.)
- **Status.** Active.
- **Revisit when.** UK compliance is production-complete *and* a second market has a verified ruleset.

### D-05 · Do not integrate Fixflo
- **Decision.** No Fixflo integration on the current roadmap.
- **Date.** June 2026.
- **Rationale.** Duplicates Tenaqo's native maintenance (a strength); creates an adversarial dependency on a competitor (Aareon-owned, gated partner API); and the sub-50-property ICP are not Fixflo customers (Fixflo's floor is 50 properties).
- **Status.** Active.
- **Revisit when.** Three or more serious 50+-unit operator prospects in the funnel require it — i.e. demand-pull, not speculation.

### D-06 · Payment lifecycle events must distinguish expected charges from cash movement
- **Decision.** Separate the cancellation of an *unpaid* charge from the reversal of a *paid* receipt. They are different events and must be recorded as such. The provenance/finance event taxonomy is:
  - `rent.charged` — an expected rent/due is created.
  - `payment.recorded` — cash/payment is recorded against a due.
  - `payment.voided` — an unpaid expected charge is cancelled; **no cash moved**.
  - `payment.reversed` — a recorded payment (actual cash) is unwound.
  - `payment.reopened` — a voided or reversed entry is restored; the event **must record which prior state it reverts** (reopen-of-void vs reopen-of-reversal). Re-asserting cash on a previously reversed receipt should be a fresh `payment.recorded`, not a silent reopen.
- **Date.** 29 June 2026. **Applies:** Principles #1, #2, #7, #8.
- **Rationale.** Surfaced by the P0 second-run audit (E-044): one verb (`void_payment`) was collapsing two operations behind a single `paid/partial`-only guard. The guard is correct *for reversing cash* and must not be weakened; the gap was a missing path for cancelling an unpaid due. Recording an unpaid-charge cancellation as a "reversal" makes the provenance trail assert cash moved when none did — for an evidence-first product, that is a trust defect, not a naming choice. Every transition emits its event **in the same transaction** as the state change (atomic, or it rolls back); there is no "where required" exception.
- **Status.** Active — ratified, implementation handed to Codex.
- **Revisit when.** Tenaqo introduces advanced payment allocation, accountant-led reconciliation, or external finance-system migration.

### D-07 · Operational balances use due-date / cycle attribution by default
- **Decision.** A payment is attributed to the rent period/cycle it belongs to (Option B), not netted oldest-arrears-first (Option A). A payment recorded against the current cycle must **not** silently reduce historical overdue arrears unless explicitly allocated there. A payment that matches no open due — overpayment, advance, or unmatched receipt — lands in an explicit **unallocated/credit** bucket; it is **never** silently applied to arrears.
- **Date.** 29 June 2026. **Applies:** Principles #2, #3, #7.
- **Rationale.** Surfaced by the P0 second-run audit (E-043): `finance_snapshot` used `total_paid_alltime`, so a current-cycle payment shrank the historical overdue bucket first. "In arrears" is a legally loaded status (it feeds arrears-based possession grounds under the Renters' Rights Act regime); silently shrinking it is exactly the consequential mistake Principle #7 requires us to make hard. Cycle attribution preserves the distinction between historic arrears and current-cycle payment, and is what makes "Explain This Balance" honest. This is a product/accounting semantics decision, deliberately ratified — not a calculation tweak chosen by making a test pass.
- **Status.** Active — ratified, implementation handed to Codex.
- **Revisit when.** Legal/accounting review requires configurable allocation rules, or external finance integrations require mapping to specialist accounting behaviour. (Manual/explicit allocation overrides may be added later; the default stays cycle-attribution.)

### D-08 · Document scan-gating lives at the Edge Function, not the storage policy
- **Decision.** Document downloads are gated for malware-scan status by the `audit_document_access` RPC inside the `signed-document-url` Edge Function, which rejects any document not in `('clean','legacy_unscanned')` *before* a signed URL is issued. The storage RLS policy (`can_select_document_storage`) is **account-authorization only** — it deliberately permits reads of `quarantine/` paths and does **not** check `scan_status`.
- **Date.** 29 June 2026. **Applies:** Principles #1, #7.
- **Rationale.** Surfaced while closing E-093 (document allow-path). The storage policy can't be the scan-gate: signed URLs are minted with the **service role**, which bypasses storage RLS entirely, and the scanner worker also reads quarantine via service role — so a `scan_status` check in the storage policy would add a cross-table join on every read for zero security benefit, since no production download path reaches storage RLS in user context. Defense-in-depth is preserved (account scoping still enforced at the storage layer); scan-gating is enforced one layer up where the actual download decision is made.
- **The invariant this rests on (load-bearing).** Document downloads **must always** route through the Edge Function. If any future path signs a `quarantine/` URL in user context, or adds a direct-storage download, the permissive storage policy becomes a hole — an unscanned/flagged file could be served. A contract test currently guards the frontend against direct storage access; that guard must not be removed.
- **Status.** Active.
- **Revisit when.** A new download path is added (must re-confirm it goes through `audit_document_access`), the signed-URL service-role pattern changes, or scan-status semantics change. Any of these requires re-checking whether the storage policy must become scan-aware.

### D-09 · Root and non-root account-resolution domains are distinct and must not be merged
- **Decision.** The account-selection logic in `AccountContext` keeps a root vs non-root branch. The two roles share a *mechanism* (prefer the stored `activeAccountId`, else fall back to the first account) but validate against **different account domains**: a **root operator** resolves against *every account in the system* (legitimate god-mode for support, telemetry, lifecycle admin); a **non-root multi-account operator** resolves against *only their own memberships*. The stored account is honored only if it belongs to the role's valid domain — for non-root, only if it appears in that user's own `accs` membership set.
- **Date.** 29 June 2026. **Applies:** Principles #1, #7.
- **Rationale.** Surfaced when an E-138 fix proposed merging the branch as "the distinction serves no purpose." It is not redundant — it is a privilege boundary. Merging it risks a non-root user pointing `localStorage.activeAccountId` at an account they don't belong to and having the app activate it. The boundary is currently enforced *twice* (defense-in-depth): at selection (this branch) **and** at the database — `my_manageable_account_ids()` carries the same root/non-root split, and `properties_select_member` / `tenants_select_member` enforce `account_id IN (SELECT my_manageable_account_ids())`, so a mis-set active account returns zero rows, not foreign data. The selection-layer correctness must not be allowed to decay on the assumption that RLS will always catch it.
- **The trap this guards against.** If the two branches ever look identical (same expression on both sides), that is **not** evidence they can be merged — it means the differing *validation domain* lives upstream (how `accs` is built per role) and is invisible at the branch. A developer who sees only the redundancy and not the domain difference must not flatten it. The deny-test (`mediumSecurityContracts`, non-root stored ID pointing out-of-scope must fall back to own `accs[0]`) is the guard; it must not be removed.
- **Status.** Active.
- **Revisit when.** The role model changes (e.g. a new cross-account role is introduced), or account resolution is refactored — at which point the upstream `accs`-scoping and the deny-test must both be re-confirmed before any branch simplification.

### D-10 · One evidence writer; distinct validation domains for signature capture
- **Decision.** All inspection-signature writes go through a single server-side mechanism — the `capture_inspection_signature` RPC (or its named successor) — which validates the caller, computes the canonical report **content** hash at the signing instant, inserts the signature, and appends the `signature.captured` provenance event **in one transaction (atomic, or the whole thing rolls back)**. Two authorization *domains* share this one writer: a **manager/landlord** caller is validated via `user_can_manage_account(account_id)`; a **tenant/share** caller is validated via active-share ownership (`share → report → account → tenant`, `tenant.user_id = auth.uid()`, share not revoked or expired). No direct `inspection_signatures` INSERT path — RPC-bypassing table policy or app-level `.insert()` — may remain for either domain.
- **Date.** 2 July 2026. **Applies:** Principles #1 (Trust), #2 (Evidence beats opinion), #7 (make consequential mistakes difficult), #8 (every module strengthens the OS).
- **Rationale.** Surfaced by the M1 tenant-signature trace during the E-033 repair. The app had *two* writers: a tenant path (`TenantEvidenceReportsPage → legalSecurityService`) doing a direct PostgREST insert with no content hash and no provenance event, and a manager RPC that anchored correctly but had no app callers — while the manager table policy stayed `FOR ALL`, so a manager could direct-insert a fabricated tenant-looking signature. The platform could record *that* someone signed but not *which report version* they signed — a direct failure of #2. Option 1 (one writer, two domains) was chosen over a post-insert provenance wrapper (Option 2) because the wrapper recreates the strong-path-beside-weak-path bifurcation already retired in E-035/E-084. Different callers legitimately validate differently; they must not therefore become different writers.
- **The invariant this rests on (load-bearing).** One writer, one anchor. Every signature — manager or tenant — is created only inside the RPC, so the content hash and the `signature.captured` event are produced together or not at all. The canonical hash identifies **document content**, not workflow state: it excludes `status`, `locked_at`, `locked_by`, the raw signature blob, and the signature being captured (workflow state is recorded in event metadata). The same shared hash rule governs the `inspection_report.locked` event, so proof-of-lock rests on `locked_at`/`locked_by` + metadata, never on the content hash changing.
- **The trap this guards against.** Two shapes of regression. (1) *Re-bifurcation* — bolting provenance onto a surviving direct-insert path, or replacing one writer with two, re-opens the E-035 split-brain (a strong path that is dark beside a weak path that is live). (2) *Domain-flattening* — this is the D-09 shape (distinct validation domains sharing one mechanism); a future reader who sees "both callers just write a signature" and collapses the manager and tenant validation branches removes a privilege boundary. Different domains, one writer — do not flatten in either direction. The no-direct-insert contract test is the guard and must not be removed.
- **Status.** Active — ratified from the M1 trace; implementation handed to Codex as the *E-033 Single-Writer Signature Capture* pass (which also carries the E-152 content-hash correction and the E-153 signature-half production-RPC deny-test).
- **Revisit when.** A third legitimate signing domain is introduced (e.g. an independent inspector or witness), an external e-signature provider is integrated, or the signature/evidence schema is refactored — at which point the per-domain validation, the single-writer invariant, and the no-direct-insert contract test must all be re-confirmed before any consolidation.

---

# Engineering Application — the Specification Header

Every specification opens with this block. It is not a citation exercise; it is a design review. If a feature cannot answer it, that is itself a signal the feature may not belong.

```
CONSTITUTIONAL REVIEW
  Primary principle served:   #__
  Principles in tension:      #__ ↔ #__   (cite Tension Registry entry, or escalate)
  Resolution:                 ____________________________________

STRATEGY GATE
  1. Does this move us toward the Operating System for Rental Operations?
  2. Is this the right next step — or are we widening before we've gone deep?
  3. Could this be better delivered by integrating a specialist rather than building it?
  4. Does this strengthen a competitive moat (Attention Engine, Provenance,
     Regulatory Proof, Trust)?
  5. If this feature disappeared tomorrow, would Tenaqo still be recognisably Tenaqo?
```

**Rules of use.** Question 1 is almost always "yes" — that is exactly why Question 2 exists: on-vision but premature is the most common way an ambitious platform overbuilds. If a spec surfaces a tension not already in Part 2, it does **not** resolve it in the Resolution line — it pauses and escalates (governance rule §3).

**Worked example — Jurisdiction Safety Guardrail (v0.2):**
- *Primary principle:* #7 (make consequential mistakes difficult), implementing #9 (never infer jurisdiction).
- *Principles in tension:* #4 (reduce cognitive load) — the guardrail adds a confirmation step.
- *Resolution:* One confirmation is justified; preventing a wrong-jurisdiction legal mistake outweighs a single click. Banner is non-dismissable because the risk is the user who forgot they overrode.
- *Strategy gate:* (1) Yes — trust-grade compliance is the OS's spine. (2) Yes — fixes an existing exposure, not new surface. (3) No — jurisdiction safety is core, not integrable. (4) Yes — Provenance & Trust moats. (5) Yes — "never infer jurisdiction" *is* Tenaqo.

---

# Part 4 — Competitive Intelligence *(stub)*

*Intentionally empty at v1.0. Will hold competitor teardowns (Fixflo, PayProp/Lettspay, TenurAI, block-management landscape), positioning analysis, and pricing strategy. Populate as research is done — do not pre-build.*

# Part 5 — Architecture *(stub)*

*Will hold system-of-record diagrams, the provenance hash-chain ledger design (BEFORE INSERT trigger as single authority, head-based verification), server-side-authority patterns, the three-surface (landlord/tenant/contractor) model, and integration topology.*

# Part 6 — Runbooks *(stub)*

*Will hold operational procedures: incident response, the compliance-rule update process, and the jurisdiction-onboarding checklist (the path a new market takes to `production_ready`).*

# Part 7 — Product History *(stub)*

*Will hold the chronological record of major increments (Regulatory Proof Engine, Proof Pack chain VS-1→VS-3, Provenance Centre, Jurisdiction Safety Guardrail) so future readers can trace how the platform got here.*

> ### ⏸ PENDING ENTRY — HELD, DO NOT PUBLISH UNTIL E-154 CLOSES
>
> **Ratified by the PO (2 Jul 2026), publication deliberately deferred.** The arc below is accurate today only with the caveat *"closed on the bootstrap-subset DB; deploy-path reproducibility pending E-154."* Publishing now would canonicalise an incomplete lesson. When E-154 (full-overlay deploy-path replay) closes, add the single closing paragraph noted at the end and move this out of PENDING into the live record.
>
> **PH-01 (draft) — Single-writer evidence capture, content-only hashing, and proof-by-execution discipline**
>
> The A-2.2 / E-033 evidence-binding work changed how Tenaqo treats signatures and proof-bearing records. The important shift was not merely adding a provenance event. The system moved from *multiple* signature writers — including a tenant direct insert and a manager bypass — to a *single* evidence writer with separate validation domains. Tenant and manager signatures now pass through the same controlled capture mechanism, with role/source values server-enforced, the report content hash computed at the signing instant, and the `signature.captured` event committed atomically with the signature row.
>
> This work also corrected the canonical inspection-report hash model. Workflow state such as `status`, `locked_at`, and `locked_by` is no longer treated as document content; those values belong in event metadata. The content hash now identifies the report content the signer saw, not the workflow transition caused by signing or locking.
>
> The key product lesson was that evidence integrity is not created by linking records together. It is created by controlling the writer, binding the act to the exact content state, and proving rollback when the anchor fails. The work also reinforced the operating discipline: source review is not closure; executed tests on a reproducible database are closure.
>
> **↪ To add when E-154 closes (one paragraph):** record that the deploy-path caveat is resolved — the single-writer capture, content-only hash, and atomic anchoring were re-proven on a fresh DB produced by the full deploy-representative overlay path (not the curated bootstrap subset), completing the "reproducible database is closure" half of the lesson.

---

## Why Parts 4–7 are empty

Per Principle #4, applied to this book itself: empty scaffolding is noise. These parts accumulate as reality demands — the book *grows* philosophy and history rather than being pre-built as a cathedral. A registry maintained ahead of the thing it governs is documentation theatre. Fill them when there is something true to put in them.

---

## Change log

| Edition | Date | Change |
|--------|------|--------|
| v1.0 | 2026-06-29 | First edition. Constitution (9 Articles + governance), Tension Registry (T-01, T-02), Decision Registry (D-01–D-05), Engineering Application header. Parts 4–7 stubbed. |
| v1.1 | 2026-06-29 | Added D-06 (payment lifecycle event taxonomy) and D-07 (due-date/cycle attribution) to the Decision Registry, ratified from the P0 Trust Sweep second-run audit (E-043 / E-044). First decisions captured *at the moment of ratification* rather than left in chat — the governance system's first live test. |
| v1.2 | 2026-06-29 | Added D-08 (document scan-gating lives at the Edge Function, not the storage policy), recorded while closing E-093. Captures a load-bearing architectural invariant — downloads must route through the Edge Function — so a future refactor can't silently turn the permissive storage policy into a hole. |
| v1.3 | 2026-06-29 | Added D-09 (root vs non-root account-resolution domains are distinct and must not be merged), recorded while fixing E-138 after a refactor proposed flattening the privilege boundary. The weakest code-level boundary of the IMR sweep (a comment beside near-identical branches), so the Registry tripwire matters most here. |
| v1.4 | 2026-07-02 | Added D-10 (one evidence writer; distinct validation domains for signature capture), ratified from the M1 tenant-signature trace during E-033. Unifies manager and tenant/share signing through `capture_inspection_signature` — distinct auth domains, one atomic writer, no direct-insert bypass — and records the content-hash-is-content-identity rule (workflow `status` excluded) shared with the lock path. Applies the D-09 "distinct domains, one mechanism" shape to the evidence writer; carries the E-035/E-084 anti-bifurcation lesson. |
| v1.5 | 2026-07-02 | Staged **PH-01 (Product History) as a HELD draft** under Part 7, per PO ruling. E-033/E-152/E-153-signature closed on the bootstrap-subset DB; the Product History lesson is not historically clean until deploy-path reproducibility (E-154) is proven. Draft captured now so publication is a one-paragraph addition once E-154 closes — not a rewrite. No live entry published; no Decision Registry change. |
