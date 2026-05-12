# Advanced Rent Models — Technical Reference

> This document covers Epic 2: Advanced Rent Models built on top of the core Rent Rules Engine (Epic 1).
> See [RENT_RULES_ENGINE.md](./RENT_RULES_ENGINE.md) for the core engine.

---

## Overview

OASIS Epic 2 adds six advanced rent models that extend the core rent calculation engine without replacing it.
All advanced models follow the same guardrails as the core engine:

- Preview first, expected charge second, Finance posting third
- No direct ledger mutation from any preview or model confirmation
- All records account-scoped with RLS
- Append-only ledger preserved
- Audit trail for all changes

### Models added

| Model | Key use case |
|---|---|
| Split Rent | Shared tenancies, joint tenants |
| Room-Based Rent | HMOs, bedsits, shared houses |
| Variable Utilities | Meter readings, invoices, usage-based billing |
| Rent Increase Workflow | Controlled rent increases with versioning |
| Discounts / Promotions | First-month offers, goodwill credits, rent holidays |
| STR Nightly | Short-term rentals, Airbnb-style properties |

---

## Feature flag decisions

Core advanced models are available to all active OASIS plans (same as core engine).
STR model is available to all plans but surfaces additional attention items when `PL_STR_COMPLIANCE` is active.

No new entitlement gates required for Epic 2 core models.
Future premium automation (bulk scheduling, open banking reconciliation) would gate behind `RENT_RULES_BULK_AUTOMATION`.

---

## Data model

### `rent_splits`
Split rent configuration per tenant for shared tenancies.

```
id, account_id, rent_plan_id, tenant_id, split_type, split_percentage,
fixed_amount, currency, effective_from, effective_to, status, rounding_adjustment,
override_reason, metadata, created_by, created_at, updated_at
```

Constraints:
- split_type: equal_split / percentage_split / fixed_amount_split / custom_manual_split
- status: draft / active / superseded / cancelled
- Unique index: one active split per (rent_plan_id, tenant_id)

### `property_rooms`
Minimal room/unit model for HMO properties.

```
id, account_id, property_id, room_label, room_type, floor,
max_occupants, amenities, status, metadata, created_at, updated_at
```

Constraints:
- room_type: single / double / ensuite / studio / other
- status: available / occupied / maintenance / inactive

### `room_rent_assignments`
Per-room rent amounts with tenant assignments.

```
id, account_id, rent_plan_id, property_id, room_id, tenant_id,
amount, currency, billing_frequency, effective_from, effective_to,
proration_policy, status, metadata, created_by, created_at, updated_at
```

Constraints:
- Unique partial index: one active assignment per (room_id, tenant_id) — no overlap
- Vacant rooms (tenant_id IS NULL) can exist but generate no expected charge

### `utility_charges`
Variable utility billing records.

```
id, account_id, rent_plan_id, property_id, tenant_id,
utility_type, calculation_method, unit_rate, standing_charge,
previous_reading, current_reading, reading_start_date, reading_end_date,
invoice_amount, split_method, split_ratio, amount_calculated, currency,
evidence_note, override_reason, status, metadata, created_by, created_at, updated_at
```

Constraints:
- utility_type: electricity / gas / water / council_tax / internet / service_charge / other
- calculation_method: fixed / manual / meter_usage / invoice_split
- split_method: equal / percentage / fixed
- status: draft / approved / posted / cancelled

### `rent_adjustments`
Discounts, promotions, rent holidays, goodwill credits.

```
id, account_id, rent_plan_id, tenant_id, property_id,
adjustment_type, amount, percentage, applies_to_charge_type,
start_date, end_date, reason, status, approved_by,
metadata, created_by, created_at, updated_at
```

Constraints:
- adjustment_type: percentage_discount / fixed_discount / rent_holiday / introductory_offer / goodwill_credit / manual_adjustment
- status: draft / active / expired / cancelled
- Rent holiday amount = 0 (explicit zero charge, not missing)
- Cannot reduce below zero unless rent_holiday

### `str_booking_charges`
Short-term rental booking charge records.

```
id, account_id, property_id, market, currency,
booking_reference, platform, check_in_date, check_out_date, nights,
nightly_rate, cleaning_fee, platform_fee, service_fee,
discount_amount, tax_amount, total_amount,
status, notes, metadata, created_by, created_at, updated_at
```

Constraints:
- nights = check_out_date - check_in_date (enforced by engine)
- check_out must be after check_in
- status: draft / confirmed / cancelled / posted
- No direct platform integrations

---

## Calculation flows

### Split Rent

```
runSplitRentCalculation({ plan, tenants, splitConfig })
→ { tenantShares[], totalRent, method, rounding, warnings }
```

- Equal: base_rent / n tenants (remainder to first)
- Percentage: each tenant's percentage × base_rent (must total 100%)
- Fixed: each tenant's fixed_amount (warns if sum ≠ total)
- Manual: explicit amounts with required reason

### Room-Based Rent

```
runRoomRentCalculation({ room, assignment, periodStart, periodEnd, isPartMonth })
→ { roomLabel, tenantId, amount, prorated, lineItems, warnings }
```

- Each room runs its own calculation
- Vacant rooms return zero charge with note
- Proration uses existing proration policies

### Variable Utilities

```
runUtilityCalculation({ charge })
→ { utilityType, usage, unitRate, standingCharge, amount, warnings }
```

- Meter: (current_reading - previous_reading) × unit_rate + standing_charge
- Invalid reading (current < previous) raises warning, blocks unless override
- Invoice split: invoice_amount / split_ratio

### STR Nightly

```
runStrCalculation({ booking })
→ { nights, nightlySubtotal, cleaningFee, fees, discount, taxPlaceholder, total, warnings }
```

- nights = daysBetween(check_in, check_out) — exclusive (check-out day not charged)
- All fees in integer pence

### Rent Increase

No new calculation — uses existing `runRentCalculation()` on the proposed new plan.
Workflow creates a new plan version with status `proposed`, tracks `notice_served_at`, activates with `activate_rent_plan()` at effective_date.

### Discounts / Promotions

Applied as a post-calculation line item:
- percentage_discount: −(total × pct)
- fixed_discount: −amount (floor at 0 unless rent_holiday)
- rent_holiday: forces total = 0 explicitly

---

## Expected charge line items

All advanced model outputs produce standard expected_charges records with line-item metadata:

```json
{
  "source_model": "split_rent|room_rent|utility|rent_increase|discount|str_nightly",
  "source_model_id": "<uuid>",
  "rent_plan_version": 2,
  "calculation_run_id": "<uuid>",
  "source_line_items": [...],
  "warnings": [...],
  "explanation": "..."
}
```

Duplicate prevention extends existing unique index to include `source_model` + `source_model_id` via partial indexes.

---

## RLS / security model

Every new table uses `user_can_manage_account(account_id)` pattern.

| Table | Owner/Admin | Staff | Tenant | Contractor |
|---|---|---|---|---|
| rent_splits | S/I/U | S | Denied | Denied |
| property_rooms | S/I/U/D | S | Denied | Denied |
| room_rent_assignments | S/I/U | S | Denied | Denied |
| utility_charges | S/I/U | S | Denied | Denied |
| rent_adjustments | S/I/U | S | Denied | Denied |
| str_booking_charges | S/I/U | S | Denied | Denied |

Cross-account access denied at RLS layer.
STR charges are account-scoped — no tenant visibility.

---

## Command Center attention items

| Item key | Bucket | Trigger |
|---|---|---|
| split_unbalanced | action | Split percentages don't total 100% |
| tenant_share_missing | action | Active rent plan has no split config for tenant |
| room_missing_rent | action | Occupied room has no active rent assignment |
| room_overlap | urgent | Two active rent assignments for same room |
| meter_reading_missing | action | Utility charge awaiting meter reading |
| unusual_utility_reading | action | Meter usage > 3× previous period average |
| rent_increase_pending | action | Proposed increase awaiting approval |
| rent_increase_notice_missing | action | Increase approved but notice not served |
| rent_increase_effective_soon | upcoming | Increase effective within 14 days |
| discount_expiring | upcoming | Active discount ends within 7 days |
| large_discount_pending | action | Discount > 20% awaiting approval |
| rent_holiday_active | upcoming | Active rent holiday note |
| str_draft_not_posted | action | STR booking charge in draft status |
| str_invalid_reference | action | STR booking has no booking_reference |

---

## Known limitations

- **Split rent UI**: Per-tenant split inputs are in the form; bulk split scheduling is a premium future feature.
- **Room model**: v1 is minimal — no floor plans, no HMO licence tracking, no room photos.
- **Variable utilities**: No direct meter provider connection. Manual or invoice input only.
- **STR model**: No calendar availability, no platform API integrations, no occupancy tracking.
- **Rent increase**: Notice period compliance warnings are market-informational only — not legal advice.
- **Discount approval**: Large discount gating uses existing Finance permission model; no dedicated approval workflow in v1.
- **Formula charge rules**: Still a schema placeholder — formula parsing not implemented.

---

## Testing strategy

### Unit tests (`tests/unit/advancedRentModels.test.js`)
Covers: split rent (all methods), room rent, STR calculation, utility calculation (all methods), discount/adjustment application, rent increase versioning logic, rounding penny handling, invalid input guards.

### Security contract tests (`tests/security/advancedRentContracts.test.js`)
Covers: cross-account access denied for all 6 new tables, tenant visibility restricted, contractor access denied, ledger not mutated by preview, duplicate expected charge prevention.

### E2E tests (`tests/e2e/advanced-rent-models.spec.js`)
Covers: model selector, split rent form + preview, room form + preview, STR booking form + preview, rent increase workflow, discount form, mobile layout.

### Regression
All existing modules verified: Finance, ledger, Rent Matching, Tax Readiness, Rent Shield, Command Center, Poland Compliance, STR Compliance, Documents, Lease Auditor.
