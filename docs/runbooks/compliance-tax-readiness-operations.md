# Tax Readiness Dashboard Operations

Use this when tax deadlines are missing, status badges look wrong, records are not matching exports, or a "Recalculate all" complaint comes in about stale data.

## What this slice does

The Tax Readiness Dashboard (`/compliance/tax`) lets managers track tax filing deadlines, record income and expense transactions, and export CSV files for accountants. It has three tabs:

- **Deadlines** — `compliance_items WHERE category='tax'`, with status derived from `due_date` / `filed_at`
- **Records** — `tax_records`, filterable by country, type, period, and review status
- **Exports** — `tax_exports`, downloadable CSV packages per country + period

All writes are gated server-side on the `tax_readiness_dashboard` entitlement (growth plan or above).

## Runtime pieces

Required migrations (apply in order):

```
supabase/compliance_suite_phase0.sql
supabase/account_entitlements.sql
supabase/compliance_security_hardening.sql
supabase/compliance_hardening_phase7.sql
```

Services:

- [src/services/taxReadinessService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/taxReadinessService.js)

Pages:

- [src/pages/compliance/TaxReadinessPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/compliance/TaxReadinessPage.jsx)
- [src/components/compliance/TaxRecordsTab.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/compliance/TaxRecordsTab.jsx)
- [src/components/compliance/TaxExportsTab.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/components/compliance/TaxExportsTab.jsx)

Known open limitations (non-blocking):

- [docs/COMPLIANCE_SUITE_LIMITATIONS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/COMPLIANCE_SUITE_LIMITATIONS.md) — L-002, L-018 remain deferred

## First checks

Always confirm:

- the correct `account_id`
- the user's plan is `growth` or above
- the signed-in user has a manage role (`owner`, `admin`, `staff`, or root)

```sql
select public.account_subscription_plan('<account_id>');
select public.account_feature_required_plan('tax_readiness_dashboard');
-- expected: 'growth'
```

## Page is hidden or shows an upgrade prompt

The compliance nav section is visible to all manage-role users. If the page shows `FeatureAccessCard` instead of the dashboard, the account is on the Starter plan.

Confirm entitlement:

```sql
select public.assert_account_feature_access('<account_id>', 'tax_readiness_dashboard');
-- returns the account_id on success, raises exception on denial
```

## Deadlines tab

### Deadline is missing

Inspect compliance items for the account:

```sql
select id, title, category, jurisdiction, deadline_date, due_date,
       filed_at, recurrence_interval_months, status, created_at
from public.compliance_items
where account_id = '<account_id>'
  and category = 'tax'
order by due_date asc;
```

If the row is absent, the user needs to add it via the `+` button on the Deadlines tab. There is no seed data for new accounts.

### Status badge looks wrong

Status is derived client-side from `due_date` and `filed_at` by `deriveTaxStatus`. The logic (as of Phase 6):

- `filed_at IS NOT NULL` → `filed`
- `due_date < today` → `overdue`
- `due_date - today ≤ 30 days` → `due_soon`
- otherwise → `upcoming`

If the badge is stale after a recurring item was filed, check that `due_date` was rolled forward. Before Phase 6, `deadline_date` was used and could be stale; after Phase 6, `due_date` is the canonical field.

```sql
select id, title, due_date, deadline_date, filed_at, recurrence_interval_months
from public.compliance_items
where account_id = '<account_id>'
  and id = '<item_id>';
```

### Mark as Filed is not recording an audit row

Filing should insert into `compliance_audit_log`:

```sql
select item_id, action, performed_by, performed_at, metadata
from public.compliance_audit_log
where account_id = '<account_id>'
  and item_id = '<item_id>'
order by performed_at desc;
```

If no row appears, `supabase/compliance_hardening_phase7.sql` has not been applied. Re-apply and re-test.

## Records tab

### Records not loading

Inspect records directly:

```sql
select id, title, country_code, record_type, amount, currency,
       record_date, review_status, created_at
from public.tax_records
where account_id = '<account_id>'
order by record_date desc
limit 20;
```

If rows exist but the UI shows nothing, verify the RLS policies are in place and the user's token includes the correct `account_id` claim.

### Summary totals look wrong (mixed currencies)

`summariseTaxRecords` groups by `currency` as of Phase 6. If totals still appear merged across currencies, the Phase 6 service code has not been deployed. The UI should show a warning banner when multiple currencies are present.

Inspect the currency breakdown:

```sql
select currency, review_status,
       sum(amount) as total
from public.tax_records
where account_id = '<account_id>'
  and country_code = '<country>'
group by currency, review_status
order by currency, review_status;
```

### Export includes records I excluded

As of Phase 6, `generateTaxRecordsCsv` skips records with `review_status = 'excluded'` by default. If excluded records appear in the CSV, the deployed service code predates Phase 6. Re-deploy and regenerate the export.

### Export date range is wrong

As of Phase 6, `listTaxRecords` filters by `recordDateFrom` / `recordDateTo` derived from the selected period label. If a "2024" export includes 2023 records, the Phase 6 date-range fix has not been deployed.

Verify the records for the expected date window:

```sql
select id, title, record_date, country_code, amount
from public.tax_records
where account_id = '<account_id>'
  and country_code = '<country>'
  and record_date >= '2024-01-01'
  and record_date <  '2025-01-01'
order by record_date;
```

## Exports tab

### Export history is missing older entries

`listTaxExports` is paginated (limit/offset). The tab shows "Load more" when there are additional pages. If entries older than the first page are missing, scroll down and click Load more.

### Export audit row is missing

As of Phase 6, `recordTaxExport` is called before `downloadCsvBlob`. If the audit row is missing after a download:

```sql
select id, period_label, country_code, record_count, status, created_at
from public.tax_exports
where account_id = '<account_id>'
order by created_at desc
limit 10;
```

If the row has `status = 'pending'` and was never patched to `'complete'`, the download likely failed after the audit write. Re-download.

## Jurisdiction constraint errors

The `compliance_items.jurisdiction` column has a `CHECK IN ('GB','PL','DE')` constraint (added Phase 7). Any direct INSERT with a non-standard code will fail:

```
new row for relation "compliance_items" violates check constraint "compliance_items_jurisdiction_check"
```

This cannot be bypassed via the app UI. If a row with a bad jurisdiction was imported, delete and recreate with a supported code.
