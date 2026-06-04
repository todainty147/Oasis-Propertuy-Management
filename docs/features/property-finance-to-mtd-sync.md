# Property Finance To MTD Sync

## Purpose

Property Finance records can feed the MTD Expense Tracker as review candidates. The MTD Expense Tracker remains the tax classification layer, and Quarterly Drafts consume reviewed tracker records rather than raw operational expenses.

## Feature Flag

- `mtd_property_finance_sync`

The flag is disabled by default and should only be enabled for staging or internal accounts until rollout is approved.

## Source Flow

1. Landlord records an operating expense on a property.
2. MTD Expense Tracker previews unsynced operating expenses for a tax year.
3. Landlord selects records to sync.
4. Tenaqo creates candidate rows in `tax_expense_classifications`.
5. Landlord confirms category and inclusion, or excludes the candidate with a reason.
6. Quarterly Drafts only consume reviewed/included MTD tracker rows.

## Category Defaults

- Mortgage -> `finance_cost`, excluded, accountant review required.
- Insurance -> `insurance`, excluded, needs review.
- Utilities -> `running_cost`, excluded, needs review.
- Tax -> `needs_review`, excluded, accountant review required.
- Repairs / maintenance -> `repairs_maintenance`, excluded, needs review.
- Management fees -> `professional_fee`, excluded, needs review.
- Other -> `needs_review`, excluded, needs review.

Automatic inclusion is not allowed.

## Dedupe Rules

Hard dedupe uses `account_id`, `source_type`, and `source_id`. Possible duplicates are flagged by matching property, close date, amount, and similar description/category.

Possible duplicates can still be created as candidates, but they default to `include_in_mtd = false` and require review.
Once a landlord confirms the category and includes a possible duplicate, Quarterly Drafts treat it as resolved; unresolved duplicate warnings stay out of draft totals.

## Audit Trail

Audit events are written through `tax_tool_audit_log` for preview, candidate creation, duplicate flags, include, exclude, and review actions.

## Limitations

This flow does not submit to HMRC. It does not decide tax treatment for the landlord. Finance costs and ambiguous categories stay review-safe until resolved.
