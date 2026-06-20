# Digital records evidence

Quarterly drafts are built from persisted tax records and reviewed Tax Tools classifications. Included payload lines must contain `source_type`, `source_table`, and `source_id`; the payload builder rejects arbitrary totals or missing provenance.

Reviewed classifications and included/excluded decisions are snapshotted in draft lines. A database trigger prevents line mutation once a draft is locked, and the lock records a sorted provenance snapshot. Exports include source references and use the same draft totals as payload generation.

The quarterly update screen has no manual total fields. Users can export summary and source-record CSV files.

Latest test timestamp: `[rerun within 30 days of production access request]`.
