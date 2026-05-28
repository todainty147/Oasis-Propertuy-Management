# In-App Tax Tools Operations

Use this when a landlord cannot see any tax-tools tabs, a save is silently failing, the CSV export is missing data, or the carried-forward calculation looks wrong.

## What this slice does

Five entitlement-gated tabs at `/compliance/tax-tools` help landlords organise UK property income records before handing off to an accountant. No HMRC submission occurs from any tab.

See [TAX_TOOLS_IN_APP.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/TAX_TOOLS_IN_APP.md) for the full feature description.

## Runtime pieces

Required migration:

```
supabase/tax_tools_phase2.sql
```

Key files:

- [src/pages/compliance/TaxToolsPage.jsx](src/pages/compliance/TaxToolsPage.jsx) — page and all tab components
- [src/utils/taxTools.js](src/utils/taxTools.js) — calculation logic
- [src/services/taxToolsService.js](src/services/taxToolsService.js) — Supabase CRUD + CSV generators

Tables (all require `user_can_manage_account`):

- `tax_expense_classifications`
- `tax_finance_cost_summaries`
- `tax_carried_forward_finance_costs`
- `tax_year_summaries`
- `tax_tool_audit_log`

## First checks

Always confirm:

- the correct `account_id`
- the user's role is `owner`, `admin`, or a manage-level staff role

```sql
-- Check which entitlements the account has
select feature_key, granted
from public.account_entitlements
where account_id = '<account_id>'
  and feature_key in (
    'mtd_expense_tracker',
    'section24_finance_cost_tracker',
    'carried_forward_finance_cost_tracker',
    'tax_tools_in_app'
  );
```

## Page is hidden or not in the sidebar

The Tax Tools page is shown when at least one of the four entitlement keys above is granted. If none are granted, the nav item will be hidden.

If the page URL is known and navigated to directly, tabs without a granted entitlement show "This subsection is behind a feature flag for staging validation." — this is expected behaviour during rollout.

Grant an entitlement for testing:

```sql
insert into public.account_entitlements (account_id, feature_key, granted, granted_by)
values ('<account_id>', 'tax_tools_in_app', true, auth.uid())
on conflict (account_id, feature_key) do update set granted = true;
```

## Tab shows "feature flag" notice instead of the form

Each tab renders `LockedTabNotice` when its specific feature flag is not granted. This is by design for staged rollout.

To unlock a specific tab:

```sql
insert into public.account_entitlements (account_id, feature_key, granted, granted_by)
values ('<account_id>', 'mtd_expense_tracker', true, auth.uid())
on conflict (account_id, feature_key) do update set granted = true;
-- repeat for section24_finance_cost_tracker / carried_forward_finance_cost_tracker as needed
```

## Save fails silently (no error banner)

As of the current code, `Section24Tracker` and `CarriedForwardTracker` show a rose error banner when a save fails. `ExpenseTracker` also shows this banner. If a save appeared to do nothing (no success, no error), check:

1. The database table exists — the service uses `isMissingBackendObject` to silently swallow `42P01` (table does not exist). If `tax_tools_phase2.sql` was never applied, saves are silently dropped:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'tax_expense_classifications',
    'tax_finance_cost_summaries',
    'tax_carried_forward_finance_costs'
  );
```

If any table is missing, apply the migration:

```bash
psql "$DATABASE_URL" -f supabase/tax_tools_phase2.sql
```

2. The user's RLS check is passing — the write policies use `user_can_manage_account`:

```sql
select public.user_can_manage_account('<account_id>'::uuid);
-- must return true
```

3. Check the Supabase client log in the browser console for the specific Supabase error returned by the failed RPC call.

## Expense record saves but does not appear in the list

`listTaxExpenseClassifications` queries `tax_expense_classifications` ordered by `expense_date desc`. Verify the record exists:

```sql
select id, tax_year, expense_date, description, category, amount, mtd_ready, created_at
from public.tax_expense_classifications
where account_id = '<account_id>'
order by expense_date desc
limit 20;
```

If the row exists but the UI does not show it, the `onSaved` callback that triggers a re-fetch may not have run. Refreshing the page should recover it.

## Section 24 summary shows wrong numbers

The calculation in `calculateSection24Comparison` is a simplified view only. It uses:

```
basicRateFinanceCostCredit = min(financeCosts * 0.2, estimatedTaxBeforeCredit)
```

The credit is capped against estimated total tax before applying the credit — not just property tax — which is a deliberate conservative simplification. A more accurate calculation requires the landlord's full tax return.

If the manager disputes the result, direct them to confirm with an accountant. The tool is for planning awareness, not filing accuracy.

## Carried-forward calculation looks wrong

`calculateCarriedForwardFinanceCost` in `taxTools.js`:

- `used = min(usedAmount, broughtForwardAmount + financeCostsThisYear)` — used cannot exceed what is available
- `carriedForward = broughtForwardAmount + financeCostsThisYear - used`

If the entered `usedAmount` is greater than the total available, it is silently clamped. This is by design to prevent negative carried-forward balances. The clamped result is shown in the read-only "Calculated carried forward" field in the form before saving.

## CSV export shows UUIDs for property column

The expense classifications and finance cost summaries CSVs export `property_id` as a UUID, not a human-readable address. This is a known open issue. Workaround: the manager (or their accountant) can cross-reference the UUID against the property list in the app or run:

```sql
select id, address, name
from public.properties
where account_id = '<account_id>'
  and id in ('<uuid1>', '<uuid2>');
```

A future improvement will resolve UUIDs to addresses in the export.

## Audit log entries are missing

The audit log is written by `taxToolsService.js` client-side after each successful save. If the network request to insert the audit row fails, the audit row is lost — there is no server-side trigger enforcing audit writes.

Verify recent entries:

```sql
select action, entity_type, entity_id, metadata, created_at
from public.tax_tool_audit_log
where account_id = '<account_id>'
order by created_at desc
limit 20;
```

## `tax_tools_set_updated_at` trigger function does not exist

If an `UPDATE` to any tax table fails with `function public.tax_tools_set_updated_at() does not exist`, the migration was partially applied. Re-apply the full file:

```bash
psql "$DATABASE_URL" -f supabase/tax_tools_phase2.sql
```

The function uses `CREATE OR REPLACE` so it is safe to re-apply.

## RLS is blocking a root/support user

The policies use `user_can_manage_account`, which checks for an active membership row. A root user without a membership row for the target account will be denied.

Root support access is provisioned through `root_support_account_access.sql`. Verify:

```sql
select public.user_can_manage_account('<account_id>'::uuid);
-- must return true; if false, check account_members for the support user
```

Do not disable RLS or grant direct table access to work around this.
