# Property Finance MTD Sync Rollout

## Checklist

- Enable `mtd_property_finance_sync` for the staging/internal account.
- Create property operating expenses for mortgage, insurance, utilities, repairs and other categories.
- Open Tax Tools -> MTD Expense Tracker.
- Preview Property Finance sync for the target tax year.
- Confirm found, already synced, new candidate and possible duplicate counts.
- Sync selected candidates.
- Confirm candidates appear with Source: Property Finance and Status: Needs review.
- Confirm unreviewed candidates do not appear in Quarterly Draft totals.
- Confirm and include one candidate.
- Rebuild a Quarterly Draft and confirm the reviewed/included candidate appears.
- Exclude one candidate with a reason and confirm it stays out of draft totals.
- Rerun sync and confirm no duplicate source rows are created.
- Verify tenant and contractor users cannot access the sync surface.
- Verify cross-account source ids are rejected by the database trigger.
- Verify Export / Accountant Pack and HMRC sandbox submission still work.

## Rollback

Disable the account feature flag. Existing candidate records remain in the MTD Expense Tracker but no new Property Finance sync UI is shown.
