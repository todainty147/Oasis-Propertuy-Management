# Maintenance Inbox Phase 4C Hardening

Phase 4C remains the Maintenance Inbox Smart Diagnostics phase. HMRC Phase 5 remains reserved for MTD live submission / production pilot.

## Feature Flags

- `maintenance_smart_diagnostics`
- `tenant_maintenance_diagnostics`
- `maintenance_deposit_evidence_linking`
- `maintenance_eco_upgrade_linking`

## Tenant Flow Checklist

- Tenant can submit the old maintenance request flow when diagnostics are disabled.
- Tenant diagnostic copy says “Possible issue category”, “These answers help your landlord review the issue” and “Landlord review required”.
- Emergency answers show the full emergency safety copy immediately.
- Tenant can still submit an emergency request.
- Tenant cannot create a work order, deposit deduction, eco-upgrade plan item, Compliance Safe record or Evidence Vault record.

## Landlord Flow Checklist

- Maintenance Inbox shows issue type, urgency, outcome category, key answers, completed steps, request attachment cue, emergency flag, possible deposit evidence, possible eco-upgrade opportunity and possible compliance review.
- Create work order remains a landlord action.
- Link existing work order, deposit, eco, compliance and evidence actions must stay landlord-confirmed.
- No diagnostic answer creates a deduction, compliance item or eco plan automatically.

## Contractor Visibility Checklist

- Contractors receive diagnostic context only through assigned work-order notes or allowed work-order surfaces.
- Contractors cannot access Deposit Vault, Eco-Upgrade Planner, Compliance Safe, Evidence Vault or tenant-private diagnostic links from a work order.

## Integration Checklists

- Deposit: label context as possible deposit evidence; amount remains blank or landlord-entered; audit events are written only after confirmed actions.
- Eco: use “Review as eco-upgrade opportunity”, “May support an upgrade review” and “Indicative planning only”; no EPC gain is promised.
- Compliance: safety-related diagnostics can be linked only after landlord confirmation and can be marked `needs_review` where appropriate.
- Evidence: request photos and notes can be reviewed as maintenance evidence; secure document/signed URL patterns remain in use.

## RLS Checklist

- Tenants create/read only their own diagnostic sessions.
- Tenants can attach only maintenance-request diagnostic links.
- Managers own landlord-only links and audit review.
- Cross-account maintenance request links are blocked.
- Diagnostic audit events are append-only.

## Dashboard Signals

Emergency, landlord-review, possible deposit evidence, possible eco-upgrade opportunity and possible compliance review signals should link to the maintenance request detail and stay landlord-only unless a tenant-safe surface is explicitly designed.

## Rollback Plan

Disable `tenant_maintenance_diagnostics` first to return tenants to the old request flow. Disable `maintenance_smart_diagnostics` to hide landlord diagnostic summaries. Disable `maintenance_deposit_evidence_linking` and `maintenance_eco_upgrade_linking` independently if integration actions need to be paused. Keep existing maintenance requests and work orders untouched.
