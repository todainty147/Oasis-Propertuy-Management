# Export and portability evidence

The quarterly accountant pack contains account/business source context, tax year, period, accounting type when known, digital record source references, included/excluded records, category totals, validation status, consent/audit references where available, HMRC receipt/correlation data, and original versus amended totals.

Summary and line exports are generated from the persisted draft snapshot used by payload generation. Secret fields, OAuth tokens, client secrets, fraud-header values, and raw sensitive payloads are excluded.

Latest test timestamp: `[rerun within 30 days of production access request]`.
