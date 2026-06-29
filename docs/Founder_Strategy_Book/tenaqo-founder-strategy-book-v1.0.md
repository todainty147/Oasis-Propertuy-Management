# Tenaqo — Founder Strategy Book
**Edition v1.0 · 29 June 2026 · Maintained by: Oasis**

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

### D-06 · Payment lifecycle events distinguish expected charges from cash movement

**Decision.**
Tenaqo separates unpaid charge cancellation from paid payment reversal. These are different financial events and must not share one ambiguous verb or provenance event.

**Accepted event taxonomy.**

* `rent.charged` — an expected rent/due amount is created.
* `payment.recorded` — actual cash/payment is recorded against a due.
* `payment.voided` — an unpaid expected charge is cancelled; no cash moved.
* `payment.reversed` — an actual recorded payment is unwound.
* `payment.reopened` — a previously voided unpaid charge is restored.

**Reopening rule.**
Reopening a voided unpaid charge may restore the due. Reopening a reversed paid receipt must not silently re-assert cash movement. If cash needs to be recognised again after reversal, it should be recorded as a fresh `payment.recorded` event, linked back to the prior reversal where appropriate.

**Rationale.**
A voided unpaid charge and a reversed paid receipt are materially different. Recording an unpaid charge cancellation as a reversal would imply cash was unwound when no cash ever moved. That would make the provenance trail misleading, which directly violates Tenaqo’s evidence and trust philosophy.

**Status.**
Active.

**Applies to.**
Finance ledger, Explain This Balance, Balance Evidence Summary, provenance finance cutover, rent schedules, payment write RPCs, tenant balance display, future external finance integrations.

**Revisit when.**
Tenaqo introduces advanced accountant-led reconciliation, external finance-system migration, or explicit payment allocation workflows.

---

### D-07 · Operational balances use due-date / cycle attribution by default

**Decision.**
Tenaqo attributes payments to their intended rent period or due cycle for operational balance display, arrears reasoning, Explain This Balance, and finance evidence summaries.

**Default rule.**
A payment recorded against the current cycle should not silently reduce historical overdue arrears unless explicitly allocated that way.

**Fallback rule.**
Unmatched, excess, advance, or otherwise unattributed payments land in an explicit **unallocated / credit bucket**. They must never be silently applied to historical arrears merely because no matching cycle exists.

**Rationale.**
Silent oldest-arrears-first netting can make historical arrears appear smaller than they are. That undermines explainability and can affect consequential landlord decisions. Due-date/cycle attribution preserves the distinction between historic arrears, current-cycle dues, future dues, and credits.

**Status.**
Active.

**Applies to.**
Finance snapshot, tenant balance, overdue/due-soon/outstanding buckets, Explain This Balance, Balance Evidence Summary, provenance finance cutover, future finance integrations.

**Revisit when.**
Legal/accounting review requires configurable allocation rules, external finance integrations require specialist mapping, or landlords need manual allocation controls.

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

---

## Why Parts 4–7 are empty

Per Principle #4, applied to this book itself: empty scaffolding is noise. These parts accumulate as reality demands — the book *grows* philosophy and history rather than being pre-built as a cathedral. A registry maintained ahead of the thing it governs is documentation theatre. Fill them when there is something true to put in them.

---

## Change log

| Edition | Date | Change |
|--------|------|--------|
| v1.0 | 2026-06-29 | First edition. Constitution (9 Articles + governance), Tension Registry (T-01, T-02), Decision Registry (D-01–D-05), Engineering Application header. Parts 4–7 stubbed. |
| v1.1 | 2026-06-29 | Added D-06 (payment lifecycle event taxonomy) and D-07 (due-date/cycle attribution) to the Decision Registry, ratified from the P0 Trust Sweep second-run audit (E-043 / E-044). First decisions captured *at the moment of ratification* rather than left in chat — the governance system's first live test. |
