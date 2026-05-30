# HMRC MTD Phase 3 Hardening Rollout

## Checklist

- Confirm HMRC OAuth connection is connected.
- Run Business Details, Obligations and Property Business read-only checks.
- Confirm no HMRC submission button is enabled.
- Confirm `hmrc_mtd_sandbox_submission` is disabled.
- Confirm `hmrc_mtd_live_submission` is disabled.
- Create income and expense records.
- Create a Quarterly Draft for the due period.
- Review category totals.
- Confirm review-only categories are excluded until deliberately included.
- Exclude and re-include a draft line.
- Confirm excluded lines do not affect totals.
- Lock the draft and confirm edits are blocked.
- Export draft summary CSV and source records CSV.
- Confirm export disclaimer is present.
- Confirm payload preview has `previewOnly: true`.
- Confirm payload preview contains no tokens, secrets or client credentials.
- Confirm tenant and contractor roles cannot access Tax Tools or drafts.
- Confirm account isolation for drafts and draft lines.
- Roll back by disabling `hmrc_mtd_quarterly_draft_builder`.

## Safe Wording

Use "draft summary", "digital record readiness", "preview only", "accountant review" and "submission disabled".

Avoid "official submission", "HMRC-recognised", "guaranteed compliant", "fully MTD compliant" and "tax advice".
