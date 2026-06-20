# Business Details accounting type evidence

Business Details API v2 responses are parsed for UK property `accountingType`. Known values are normalized to `CASH` or `ACCRUALS`; absent values remain unknown and unrecognized future values are handled as `UNKNOWN`.

The value is stored in HMRC connection metadata against the discovered business source, displayed on the HMRC connection screen, snapshotted on quarterly drafts, included in accountant exports, and audited on refresh. Users cannot edit it directly.

If HMRC reports a changed accounting type after draft creation, affected drafts are marked for review. Sandbox submission and the controlled live-pilot gate block while review is unresolved, including when the draft was already locked. Tenaqo does not claim to support updating accounting type through Business Details.

Clearing the review gate is performed only through the `revalidate_mtd_draft_accounting_type` SECURITY DEFINER RPC. It permits account owners/admins and authorised root operators, denies staff/tenant/contractor/cross-account callers, blocks direct client updates, and writes the `hmrc.accounting_type_revalidated` audit event. If HMRC did not return an accounting type, a review note is required to document that fact.

Latest test timestamp: `[rerun within 30 days of production access request]`.
