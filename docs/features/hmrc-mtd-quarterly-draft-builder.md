# HMRC MTD Quarterly Draft Builder

## Purpose

The quarterly draft builder prepares reviewable quarterly totals from existing Tenaqo records. It is an aggregation, validation and export layer over Tax Records, MTD Expense Tracker, Section 24 finance-cost context, carried-forward finance-cost context and accountant-pack exports.

It does not submit anything to HMRC.

## Feature Flags

- `hmrc_mtd_quarterly_draft_builder` - enables the Quarterly Drafts tab per account.
- `hmrc_mtd_sandbox_submission` - reserved for a later sandbox submission phase and remains disabled.
- `hmrc_mtd_live_submission` - reserved for a later live pilot and remains disabled.

All HMRC MTD flags are account-level flags and are disabled by default.

## Data Model

Draft-only tables:

- `mtd_quarterly_update_drafts`
- `mtd_quarterly_update_draft_lines`
- `mtd_quarterly_update_audit_events`

The builder stores snapshot lines with source references. It does not create another generic income or expense ledger and does not mutate source records.

## Source Records Reused

Canonical source order:

1. `tax_records` for income, expense, adjustment and evidence records.
2. `tax_expense_classifications` for manual MTD Expense Tracker rows.
3. `tax_finance_cost_summaries` as Section 24 review context only.
4. `tax_carried_forward_finance_costs` as annual/accountant context only.

Summary-only and estimate-only records are flagged for review and are not silently treated as final quarterly transactions.

## Category Mapping

`src/lib/mtd/mtdCategoryMapping.js` maps existing Tenaqo categories to internal MTD-ready categories. These are review categories, not a claim that the payload is HMRC-approved.

Special handling:

- `capital_improvement` is flagged `needs_review`.
- `mixed_use_review` is flagged `needs_review`.
- `needs_accountant_review` is flagged `needs_review`.
- `finance_cost` is flagged for Section 24 treatment review.
- Evidence-only records support readiness/export but are not income or expense totals.

## Validation Checks

The draft summary tracks:

- included and excluded lines
- income, expense and adjustment totals
- uncategorised records
- missing evidence
- accountant-review records
- estimate-only context
- possible duplicate placeholders

## Payload Preview

Each draft stores a `payload_preview` JSON object with:

- `previewOnly: true`
- `hmrcSubmissionDisabled: true`
- period metadata
- category totals
- validation summary
- source summary

No secrets, tokens, refresh tokens or client credentials are included.

## Export / Accountant Pack

Quarterly Drafts supports:

- draft summary CSV
- source records CSV
- payload preview display

The Export / Accountant Pack tab points users to the Quarterly Drafts tab for draft-specific exports.

## Not Implemented

- No sandbox quarterly submission.
- No live quarterly submission.
- No final declaration.
- No HMRC write endpoints.
