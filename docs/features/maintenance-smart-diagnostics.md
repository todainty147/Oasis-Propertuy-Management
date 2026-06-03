# Maintenance Smart Diagnostics

Phase 4C adds flag-gated maintenance smart diagnostics for early-access accounts. Diagnostics are basic information gathering only; they help prepare a diagnostic summary for landlord review.

## Feature Flags

- `maintenance_smart_diagnostics`: landlord Maintenance Inbox diagnostic summaries and review flags.
- `tenant_maintenance_diagnostics`: tenant-facing basic troubleshooting questions before request submission.
- `maintenance_deposit_evidence_linking`: planned landlord-controlled links to possible deposit evidence.
- `maintenance_eco_upgrade_linking`: planned landlord-controlled links to possible eco-upgrade opportunities.

These flags default to disabled. Enable them only for staging/internal or selected early-access accounts until rollout is approved.

## Tenant Fields

- Issue type: selects the diagnostic template.
- Basic troubleshooting questions: short information-gathering questions; not repair advice.
- Emergency risk answers: surface emergency copy and can mark the request urgent for landlord review.
- Description: the tenant's own request description. When diagnostics are enabled, the generated diagnostic summary is appended to the maintenance request description for visibility.

Emergency copy:

> These checks are for basic information gathering only. Do not attempt repairs you are not qualified to perform. If there is a gas smell, electrical danger, fire, flooding, carbon monoxide alarm, security risk, or immediate danger, contact emergency services or the relevant emergency provider immediately.

## Landlord Inbox Fields

- Diagnostic summary: safe summary for landlord review.
- Issue type: selected diagnostic category.
- Urgency: low, normal, high, or urgent.
- Outcome category: landlord review, emergency review, possible deposit evidence, possible upgrade opportunity, or possible compliance review.
- Key answers: a short list of tenant answers used to prepare the summary.
- Flags: possible tenant-responsibility indicator, possible deposit evidence, possible upgrade opportunity, and possible compliance review.

All actions remain landlord-controlled. Diagnostics do not create deductions, upgrades, compliance items, or work orders automatically.

## Backend Tables

- `maintenance_diagnostic_templates`
- `maintenance_diagnostic_steps`
- `maintenance_diagnostic_sessions`
- `maintenance_diagnostic_answers`
- `maintenance_diagnostic_links`
- `maintenance_diagnostic_audit_events`

Triggers enforce account consistency for answers, links, audit events, and attached maintenance requests.

## Safe Wording

Use: basic troubleshooting questions, information gathering, diagnostic summary, landlord review, possible tenant-responsibility indicator, possible deposit evidence, possible upgrade opportunity, not a substitute for professional advice.

Avoid: Tenaqo diagnoses the problem, no contractor needed, guaranteed to reduce call-outs, tenant is liable, deduct from deposit automatically, repair advice.
