# Eco-Upgrade Planner

Eco-Upgrade Planner helps landlords prepare EPC improvement plans with indicative costs, suggested upgrade paths and work-order handoff.

## Feature Flags

- `eco_upgrade_planner`
- `portfolio_health_eco_compliance`

Minimum plan: Growth. Pro and Operator/Agency inherit access. Starter accounts should not receive Eco-Upgrade Planner unless a deliberate account-level feature flag override is enabled for a controlled support case.

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

## Field Reference

### EPC Profile Form

- `Property`: The property the EPC profile and upgrade plan belong to. The page defaults to the first available property if the landlord has not selected one.
- `Current EPC band`: The latest known EPC band for the property. Use `unknown` when the band has not been captured yet.
- `Current EPC score optional`: Optional numeric EPC score from 1 to 100. When present, this is used instead of the band midpoint for estimates.
- `Planning target EPC band`: The landlord's planning target for the estimate, currently shown as `Band A` through `Band E`. This is a planning target, not a compliance guarantee.
- `Property type`: Free-text context such as flat, terrace, semi-detached or HMO. Stored for assessor/landlord review; not yet used to filter suggestions.
- `Heating type`: Free-text context such as gas boiler, electric heating or heat pump. Stored for review; not yet used to filter suggestions.
- `Last EPC date`: Optional date of the latest EPC certificate.
- `EPC certificate document ID`: Optional document reference for a stored EPC certificate. This is a manual link field in the current version.
- `Insulation notes`: Free-text notes about loft, cavity wall, draught proofing, windows or other known property conditions.

### Result Panel

- `Current`: Shows the current EPC band and score used by the planner. If only a band is supplied, Tenaqo uses the midpoint of that band for the estimate.
- `Target`: Shows the selected planning target band.
- `Estimated gain`: Sum of the selected upgrade rows' estimated EPC point gains.
- `Estimated result`: Indicative projected EPC band after applying the selected point gain. This is not an assessor result.
- `Estimated cost`: Sum of selected upgrade row costs.
- `Target reached`: Indicates whether the indicative projected score reaches the selected target band threshold.
- `Risk message`: Human-readable planning context based on the current band. Examples include EPC data needed, planning opportunity, at EPC E or below EPC E.
- `Confidence`: Low until enough EPC and upgrade data exists; medium when selected upgrade estimates and EPC data are present.

### Suggested Upgrades Table

- `Selected`: Includes or excludes an upgrade from the plan totals and estimated result. Suggested rows are selected by default for a new plan.
- `Upgrade`: The upgrade catalogue item label and description.
- `Indicative cost (editable)`: Editable planning estimate for that upgrade. Seeded values are midpoint estimates from the controlled Tenaqo catalogue, not live quotes or web-searched prices.
- `Estimated points`: Editable estimated EPC point gain for the upgrade. Seeded values are midpoint estimates from the catalogue.
- `Priority`: Landlord planning priority: `low`, `medium` or `high`.
- `Notes`: Free-text landlord notes for the row.
- `Action`: Shows `Save plan first` until the row has been saved as a plan item. Saved rows show `Prepare handoff`, which prepares maintenance work-order handoff context.

### Plan Summary

- `Property`: The selected property.
- `Selected plan cost`: Sum of selected upgrade costs.
- `High priority upgrades`: Count of selected rows marked `high`.
- `Completed upgrades`: Count of saved plan items with a completion timestamp.
- `Saved plan records`: Count of saved plan records for the selected property.

## Data Model Fields

### `property_epc_profiles`

- `id`: Internal profile id.
- `account_id`: Account that owns the profile.
- `property_id`: Property the profile belongs to. One profile per account/property pair.
- `current_epc_band`: Current known EPC band, or `unknown`.
- `current_epc_score`: Optional numeric EPC score from 1 to 100.
- `target_epc_band`: Planning target band, default `C`.
- `target_epc_score`: Optional numeric target score. Reserved for richer target modelling.
- `property_type`: Free-text property type context.
- `heating_type`: Free-text heating context.
- `insulation_notes`: Free-text condition notes.
- `last_epc_date`: Date of the latest EPC certificate if known.
- `epc_certificate_document_id`: Optional document id for a stored EPC certificate.
- `created_by`: User id reserved for creator attribution.
- `created_at`: Profile creation timestamp.
- `updated_at`: Last profile update timestamp.

### `eco_upgrade_options`

- `id`: Internal catalogue option id.
- `upgrade_key`: Stable catalogue key, such as `draught_proofing`.
- `label`: Human-readable upgrade name.
- `description`: Short explanation shown in the table.
- `typical_cost_low`: Lower seeded planning cost.
- `typical_cost_high`: Higher seeded planning cost.
- `estimated_epc_points_low`: Lower seeded EPC point estimate.
- `estimated_epc_points_high`: Higher seeded EPC point estimate.
- `applicable_property_types`: Reserved property-type filter list.
- `category`: Upgrade category such as insulation, glazing, heating controls or renewables.
- `active`: Whether the option appears in suggestions.
- `created_at`: Catalogue record creation timestamp.

### `property_eco_upgrade_plans`

- `id`: Internal plan id.
- `account_id`: Account that owns the plan.
- `property_id`: Property the plan belongs to.
- `epc_profile_id`: Linked EPC profile used for the plan.
- `status`: Plan lifecycle value: `draft`, `planned`, `in_progress`, `completed` or `archived`.
- `target_band`: Target band used for the plan estimate.
- `estimated_total_cost`: Stored plan total calculated from selected items.
- `estimated_epc_points_gain`: Stored point gain calculated from selected items.
- `estimated_result_band`: Stored indicative result band.
- `notes`: Reserved plan-level notes.
- `created_by`: User id reserved for creator attribution.
- `created_at`: Plan creation timestamp.
- `updated_at`: Last plan update timestamp.

### `property_eco_upgrade_plan_items`

- `id`: Internal plan item id.
- `account_id`: Account that owns the item.
- `plan_id`: Parent upgrade plan id.
- `upgrade_option_id`: Linked catalogue option, when the item came from the seeded catalogue.
- `selected`: Whether the row counts toward plan totals.
- `estimated_cost`: Editable cost used in plan totals.
- `estimated_epc_points_gain`: Editable EPC point gain used in estimates.
- `priority`: Planning priority: `low`, `medium` or `high`.
- `linked_work_order_id`: Optional work order id once an upgrade is tracked through maintenance.
- `linked_document_id`: Optional supporting document id.
- `completed_at`: Completion timestamp for the upgrade item.
- `notes`: Row-level landlord notes.
- `created_at`: Item creation timestamp.
- `updated_at`: Last item update timestamp.

### `property_eco_upgrade_audit_events`

- `id`: Internal audit event id.
- `account_id`: Account the event belongs to.
- `property_id`: Property context for the event.
- `plan_id`: Related plan id, when applicable.
- `user_id`: User who performed the action, when available.
- `event_type`: Event name, such as plan created or work-order handoff prepared.
- `metadata`: JSON context for the event.
- `created_at`: Event timestamp.

## Safe Wording

Use:

- Eco-Upgrade Planner
- EPC upgrade estimate
- indicative cost
- Review as eco-upgrade opportunity
- May support an upgrade review
- Indicative planning only

## Maintenance Smart Diagnostics Link

Maintenance Smart Diagnostics can flag possible upgrade opportunities for landlord review. It does not create eco-upgrade plan items automatically.

When enabled with `maintenance_eco_upgrade_linking`, diagnostic context may be used to prepare a landlord-confirmed review. It must not promise EPC point gain from a diagnostic alone, and linked work orders must remain part of the normal maintenance workflow.

Avoid claims that a plan creates a certain EPC result, property value change, legal outcome or compliance outcome.

## Access Model

Owners/admins/staff who can manage the account can manage EPC profiles and upgrade plans. Contractors should only see linked work-order context, not the wider plan. Tenants do not access these records in this phase.

## Limitations

- Estimates are indicative only.
- Tenaqo does not replace an EPC assessor, surveyor, legal adviser or tax adviser.
- The planner does not submit certificates or verify statutory compliance.
