# MTD Expense Tracker

## Purpose

The MTD Expense Tracker is the tax classification layer for landlord expense records. It can hold manual rows and review candidates from Property Finance, but it does not submit anything to HMRC and does not replace accountant review.

## Feature Flags

- `mtd_expense_tracker` enables the tracker.
- `mtd_property_finance_sync` enables the controlled Property Finance sync preview and candidate workflow. It is account-flag only and is disabled by default.

## Candidate Model

Property operating expenses are synced into `tax_expense_classifications` with source metadata:

- `source_type = property_operating_expense`
- `source_table = property_operating_expenses`
- `source_id` set to the original operating expense id
- `source_label = Property Finance`
- `review_status = needs_review`
- `include_in_mtd = false`
- `mtd_ready = false`

The original Property Finance record is not mutated by the MTD layer.

## Review Workflow

Landlords can preview Property Finance records, select which records to sync, then review each candidate in the tracker. A candidate is not reliable for a quarterly draft until the landlord confirms the category and includes it.

Excluding a candidate records a reason. Possible duplicates remain excluded from draft totals until reviewed.
