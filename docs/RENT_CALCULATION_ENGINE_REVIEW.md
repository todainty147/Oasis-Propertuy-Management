# Rent Calculation Engine — Discovery Review

> Generated as Phase A of the Rent Calculation Engine epic.  
> All file paths are relative to the repository root.

---

## 1. Existing Finance / Payment Tables

### `payments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto-generated |
| `account_id` | uuid | account scope |
| `owner_id` | uuid | legacy owner ref |
| `property_id` | uuid | |
| `tenant_id` | uuid | |
| `amount` | numeric(10,2) | |
| `status` | text | CHECK: `due`, `paid`, `overdue`, `void` |
| `due_date` | date | |
| `paid_at` | date | null = not yet paid |
| `currency` | text | CHECK: GBP, PLN, EUR, USD, CZK, CHF, … |
| `notes` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `ledger_entries` (append-only)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid | |
| `property_id` | uuid | nullable |
| `tenant_id` | uuid | nullable |
| `lease_id` | uuid | nullable |
| `entry_type` | text | CHECK: `rent`, `payment`, `expense`, `deposit`, `refund`, `fee`, `invoice` |
| `direction` | text | CHECK: `in`, `out` |
| `amount` | numeric(12,2) | always > 0 |
| `currency` | text | |
| `occurred_at` | timestamptz | |
| `source_table` | text | links back to the source record |
| `source_id` | uuid | links back to the source record |
| `external_ref` | text | |
| `created_by` | uuid | |

**Append-only invariant:** `create_ledger_entry()` RPC only inserts. No UPDATE/DELETE path. Mutation of a posted entry requires voiding + re-creating.

---

## 2. Tenant / Property Rent Fields

### `properties`
- `rent numeric` — monthly rent amount (single field, no frequency)
- `account_id`, `id`, `address`, `city`, `tenant_id`

### `tenants`
- `property_id`, `account_id`, `status`, `archived_at`
- No rent-specific fields beyond the property link

### `leases`
- `rent_amount numeric(12,2)` — lease-specific rent override
- `rent_frequency text` — DEFAULT `'monthly'`
- `deposit_amount numeric(12,2)`
- `start_date date`, `end_date date`, `lease_start_date date`

**Key finding:** `rent_frequency` and `deposit_amount` already exist on leases. The rent calculation engine should prefer `leases.rent_amount` over `properties.rent` when a lease is linked, and can inherit `rent_frequency` as the default plan frequency.

---

## 3. Payment Status Values (JS: `src/utils/statuses.js`)

```js
PAYMENT_STATUS = { PAID, PARTIAL, PENDING, OVERDUE, OTHER }
```

Legacy Polish aliases normalised: `opłacone → paid`, `zaległe → overdue`, `oczekujące → pending`.  
The `payments.status` CHECK allows only: `due`, `paid`, `overdue`, `void`.  
The JS layer also uses `partial` and `pending` (mapped from `due`).

---

## 4. Ledger Posting Pattern

**RPC:** `create_ledger_entry(p_account_id, p_entry_type, p_direction, p_amount, p_currency, p_property_id, p_tenant_id, p_occurred_at, p_notes) → ledger_entries`

**Rule:** The calculation engine **must never call** `create_ledger_entry` directly. Expected charges post to the `payments` table via the approved `create_payment` RPC; a separate step (Finance → Post to ledger) mirrors the entry to `ledger_entries`.

---

## 5. Payment RPCs

| RPC | Purpose |
|---|---|
| `create_payment(account_id, property_id, tenant_id, amount, due_date, paid_at, notes)` | Create a new payment record |
| `update_payment(account_id, payment_id, amount, due_date, notes)` | Immutability: cannot change amount of a paid payment |
| `mark_payment_paid(account_id, payment_id, paid_at)` | Sets status=paid, paid_at |
| `mark_payment_unpaid(account_id, payment_id)` | Reverts to overdue/due |
| `void_payment(payment_id, account_id)` | status=void |
| `reopen_payment(payment_id, account_id)` | Re-opens a voided payment |
| `delete_payment(account_id, payment_id)` | Hard delete (no ledger trace) |

---

## 6. Finance Services / Hooks

- `src/services/financeService.js` → `getFinanceSnapshot()` calls RPC `finance_snapshot`
- `src/hooks/useFinance.js` → returns `{ summary, payments, propertyFinance, loading, error, reload }`
- `src/utils/finance.js` → pure helpers: `buildPaymentCycles`, `sumPaid`, `sumOverdue`, `calculatePropertyFinance`

---

## 7. RLS Pattern

All tables use `FORCE ROW LEVEL SECURITY`.

Policies follow this template:
```sql
CREATE POLICY "table_action_role" ON public.table_name
FOR SELECT TO authenticated
USING (public.user_can_manage_account(account_id));
```

Helper functions:
- `public.user_can_manage_account(account_id)` — returns bool
- `public.assert_manage_account_access(account_id)` — raises on failure
- `public.account_role_for(account_id)` — returns role string
- `public.assert_tenant_scope_access(account_id, tenant_id)` — tenant-scoped data

---

## 8. Attention Center (`attention_center_items` RPC)

Existing rent item types: `overdue_rent`, `due_soon_rent`  
Buckets: `urgent` (sort 10), `action` (sort 40), `upcoming` (sort 30)

New item types to add (Phase G):
- `rent_plan_missing` — occupied property has no active rent plan (action)
- `rent_plan_draft` — rent plan exists but not activated (action)
- `expected_charge_overdue` — expected charge past due and not posted (urgent)
- `rent_match_unposted` — confirmed rent match not yet posted to Finance (action)

---

## 9. Entitlements

`RENT_CALC_ENGINE: "rent_calc_engine"` — Growth tier and above.

This gates access to the Rent Plans page, expected charge generation, and calculation previews. Core Finance (creating/viewing payments) remains on Starter.

---

## 10. Calculation Engine Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Currency arithmetic | Integer pence | Eliminates floating-point drift |
| Frequency anchor | Earliest payment date | Lease date preferred if available |
| Due day | Configurable 1–28; default 1 | User confirmed: 1st of month |
| Overpayment | Rolls forward | Reduces future obligations |
| UK deposit cap | 5 weeks (< £50k/yr), 6 weeks (≥ £50k/yr) | Tenant Fees Act 2019 |
| PL deposit | Configurable warning, no statutory max hardcoded | Market-specific placeholder |
| Proration on part-month | `actual_days_in_month` default | Most tenant-friendly |
| Ledger posting | User-approved step, never automatic | Append-only invariant |
| Rent plan versioning | New plan supersedes old, old marked `superseded` | Full audit trail |

---

## 11. New Tables to Create (Phase B)

1. `rent_plans` — rent plan configuration per property/tenant
2. `rent_charge_rules` — per-plan charge line items (utilities, parking, etc.)
3. `rent_calculation_runs` — audit log of every preview/approved run
4. `expected_charges` — generated charge obligations before posting

All tables: `account_id` FK, account-scoped RLS, `created_at`/`updated_at`, UUID PKs.
