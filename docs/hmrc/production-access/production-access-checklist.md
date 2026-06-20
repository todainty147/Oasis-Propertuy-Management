# Production access checklist

- [ ] Confirm scope remains in-year UK property only.
- [ ] Review HMRC changes dated 15 June 2026.
- [ ] Verify Business Details accounting type behavior with current test source.
- [ ] Capture fraud-header evidence without values or secrets.
- [ ] Validate the account-scoped `Gov-Client-Device-ID` fallback with HMRC and track the per-browser identifier improvement.
- [ ] Prove digital provenance and no manual submission totals.
- [ ] Prove original and amendment flows, consent, audit, errors and exports.
- [ ] Prove live-pilot timeout/network failures close attempts and ambiguous outcomes warn against blind retry.
- [ ] Prove accounting-type review can only be cleared by the audited role-gated RPC.
- [ ] Confirm unsupported features are declared.
- [ ] Review security, privacy, terms and support runbooks.
- [ ] Record human review of AI-assisted implementation and tests.
- [ ] Confirm no HMRC approved/accredited wording.
- [ ] Rerun sandbox tests within 30 days of the production access request.
- [ ] Confirm `READY_FOR_GENERAL_LIVE_SUBMISSION=false`.
- [ ] Do not run a real live-network submission as part of this checklist.
