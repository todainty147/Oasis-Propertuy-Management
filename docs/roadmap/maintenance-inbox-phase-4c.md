# Maintenance Inbox Phase 4C

## Scope

Phase 4C introduces flag-gated smart diagnostics for maintenance requests. The goal is structured context before landlord review, not diagnosis, repair advice, or automated liability decisions.

## Delivered

- Additive Supabase overlay: `maintenance_smart_diagnostics.sql`.
- Early-access feature flags for landlord diagnostics, tenant diagnostics, deposit evidence linking, and eco-upgrade linking.
- Seed diagnostic templates for common request types.
- Tenant request form issue selector and basic troubleshooting questions when enabled.
- Diagnostic summary appended to submitted requests and stored as a diagnostic session.
- Maintenance Inbox diagnostic summary panel with possible evidence, upgrade, emergency, and compliance flags.
- Completed-step count and attachment-review cue in the landlord diagnostic panel.
- Account-consistency triggers and RLS for diagnostic sessions, answers, links, and audit events.

## Hardening Checklist

- Tenant copy uses “Possible issue category”, “These answers help your landlord review the issue” and “Landlord review required”.
- Emergency copy is visible when emergency triggers are answered yes.
- Tenant-created diagnostics attach only to the submitted maintenance request.
- Landlord-only records remain landlord-confirmed: no automatic work order, deposit deduction, eco-upgrade plan item, compliance item or Evidence Vault record is created from a tenant answer.
- Contractors receive only work-order context after assignment.
- Cross-account maintenance request links are blocked by the diagnostic account trigger.
- Audit events are append-only.

## Deferred

- Creating deposit deductions from diagnostic flags.
- Creating eco-upgrade plan items from diagnostic flags.
- Compliance Safe item creation from diagnostic flags.
- Contractor portal diagnostic summaries beyond existing work order note visibility.
- Dashboard rollups.

All deferred items must remain landlord-controlled and should be marked planned until implemented.

HMRC Phase 5 remains reserved for MTD live submission / production pilot.
