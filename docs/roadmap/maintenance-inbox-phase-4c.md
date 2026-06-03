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
- Account-consistency triggers and RLS for diagnostic sessions, answers, links, and audit events.

## Deferred

- Creating deposit deductions from diagnostic flags.
- Creating eco-upgrade plan items from diagnostic flags.
- Compliance Safe item creation from diagnostic flags.
- Contractor portal diagnostic summaries beyond existing work order note visibility.
- Dashboard rollups.

All deferred items must remain landlord-controlled and should be marked planned until implemented.
