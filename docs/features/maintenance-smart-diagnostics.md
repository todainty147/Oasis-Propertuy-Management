# Maintenance Smart Diagnostics

Phase 4C adds flag-gated maintenance smart diagnostics for early-access accounts. Diagnostics are basic information gathering only; they help prepare a diagnostic summary for landlord review.

## Feature Flags

- `maintenance_smart_diagnostics`: landlord Maintenance Inbox diagnostic summaries and review flags.
- `tenant_maintenance_diagnostics`: tenant-facing basic troubleshooting questions before request submission.
- `maintenance_deposit_evidence_linking`: planned landlord-controlled links to possible deposit evidence.
- `maintenance_eco_upgrade_linking`: planned landlord-controlled links to possible eco-upgrade opportunities.

These flags default to disabled. Enable them only for staging/internal or selected early-access accounts until rollout is approved.

## Tenant Fields

- Possible issue category: selects the diagnostic template.
- Basic troubleshooting questions: short information-gathering questions; not repair advice.
- Emergency risk answers: surface emergency copy and can mark the request urgent for landlord review.
- Landlord review required: visible before submission so the tenant understands Tenaqo is not deciding the outcome.
- Description: the tenant's own request description. When diagnostics are enabled, the generated diagnostic summary is appended to the maintenance request description for visibility.

Emergency copy:

> These checks are for basic information gathering only. Do not attempt repairs you are not qualified to perform. If there is a gas smell, electrical danger, fire, flooding, carbon monoxide alarm, security risk, or immediate danger, contact emergency services or the relevant emergency provider immediately.

## Landlord Inbox Fields

- Diagnostic summary: safe summary for landlord review.
- Issue type: selected diagnostic category.
- Urgency: low, normal, high, or urgent.
- Outcome category: landlord review, emergency review, possible deposit evidence, possible upgrade opportunity, or possible compliance review.
- Key answers: a short list of tenant answers used to prepare the summary.
- Completed steps: count of answered diagnostic steps.
- Photos: landlords review request attachments; diagnostics do not move files into a public bucket.
- Flags: possible tenant-responsibility indicator, possible deposit evidence, possible upgrade opportunity, and possible compliance review.

All actions remain landlord-controlled. Diagnostics do not create deductions, upgrades, compliance items, or work orders automatically.

## Integration Checklist

- Work orders: landlord-confirmed only. The handoff note may include the safe diagnostic summary for contractor context.
- Deposit Vault: diagnostic flags are “possible deposit evidence” only. Amounts stay blank or landlord-entered.
- Eco-Upgrade Planner: use “Review as eco-upgrade opportunity”, “May support an upgrade review” and “Indicative planning only”. Diagnostics never promise EPC gain.
- Compliance Safe: safety-related diagnostics can be reviewed by a landlord before any compliance item is created or linked.
- Evidence Vault: request photos and notes can be reviewed as maintenance evidence, with landlord confirmation before evidence records are created or linked.
- Contractor portal: contractors should only see diagnostic context through assigned work-order notes, not Deposit Vault, Eco-Upgrade Planner, Compliance Safe or tenant-private records.

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

Avoid wording that confirms a diagnosis, removes contractor review, promises outcomes, assigns tenant liability, automates deposit deductions, or gives repair instructions.

HMRC Phase 5 remains reserved for MTD live submission / production pilot.
