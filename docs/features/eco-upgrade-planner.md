# Eco-Upgrade Planner

Eco-Upgrade Planner helps landlords prepare EPC improvement plans with indicative costs, suggested upgrade paths and work-order handoff.

## Feature Flags

- `eco_upgrade_planner`
- `portfolio_health_eco_compliance`

Both flags are account-level controls and are disabled by default. Enable only for staging/internal accounts until rollout is approved.

## Routes

- `/portfolio-health/eco-upgrade-planner`

## Tables

- `property_epc_profiles`
- `eco_upgrade_options`
- `property_eco_upgrade_plans`
- `property_eco_upgrade_plan_items`
- `property_eco_upgrade_audit_events`

## What It Does

- Stores property EPC profile details for landlord review.
- Suggests upgrade options from a controlled catalogue.
- Estimates cost and EPC points impact using indicative ranges.
- Shows whether a selected plan appears to reach the landlord's planning target.
- Prepares a maintenance handoff note so upgrade work can be tracked in the existing work-order workflow.

## Safe Wording

Use:

- Eco-Upgrade Planner
- EPC upgrade estimate
- indicative cost
- suggested upgrade path
- review with EPC assessor

Avoid claims that a plan creates a certain EPC result, property value change, legal outcome or compliance outcome.

## Access Model

Owners/admins/staff who can manage the account can manage EPC profiles and upgrade plans. Contractors should only see linked work-order context, not the wider plan. Tenants do not access these records in this phase.

## Limitations

- Estimates are indicative only.
- Tenaqo does not replace an EPC assessor, surveyor, legal adviser or tax adviser.
- The planner does not submit certificates or verify statutory compliance.
