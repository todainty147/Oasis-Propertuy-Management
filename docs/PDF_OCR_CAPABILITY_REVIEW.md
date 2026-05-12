# PDF / OCR / Document Extraction Capability Review

> **Purpose:** Technical reference for the Poland Compliance Evidence Pack epic.
> Captures what document-processing infrastructure already exists, where it lives,
> what it supports, and what is safe to build on top of it.

---

## 1. What currently exists

OASIS has a full async document extraction pipeline:

| Layer | Location | Status |
|---|---|---|
| Extraction worker (Node.js) | `scripts/documentExtraction/worker.js` | **Production-ready** |
| Native PDF extractor | `scripts/documentExtraction/extractors/nativePdf.js` | **Production-ready** |
| OCR fallback (stub) | `scripts/documentExtraction/extractors/ocrFallback.js` | **Stub — not wired** |
| Extraction router | `scripts/documentExtraction/extractors/router.js` | **Production-ready** |
| Quality evaluator | `scripts/documentExtraction/qualityEvaluator.js` | **Production-ready** |
| Source hash utility | `scripts/documentExtraction/sourceHash.js` | **Production-ready** |
| `document_extraction_runs` table | `supabase/baseline_schema.sql` | **Production-ready** |
| `document_extractions` table | `supabase/baseline_schema.sql` | **Production-ready** |
| Extraction service (frontend) | `src/services/documentExtractionService.js` | **Production-ready** |
| Lease Auditor edge function | `supabase/functions/generate-lease-clause-audit/index.ts` | **Production-ready** |
| AI safety utilities | `supabase/functions/_shared/aiSafety.ts` | **Production-ready** |

---

## 2. Where it lives

```
scripts/documentExtraction/
├── worker.js                     # Long-running poller — run separately, not in Supabase
├── sourceHash.js                 # SHA-256 dedup
├── qualityEvaluator.js           # Quality flag + confidence score
└── extractors/
    ├── router.js                 # MIME-type routing: PDF → native, image → OCR
    ├── nativePdf.js              # pdf-parse: extracts selectable text from born-digital PDFs
    └── ocrFallback.js            # STUB — throws OcrNotConfiguredError unless OCR_FALLBACK_ENABLED=true

supabase/functions/
└── generate-lease-clause-audit/  # Consumes extraction text → OpenAI → clause findings
    └── _shared/
        ├── aiSafety.ts           # checkAndReserveAiCall, recordAiTokens, buildUntrustedJsonPrompt
        └── leaseClauseInsight.ts # Prompt builder and output parser for lease clause analysis
```

---

## 3. Supported file types

| MIME type | Native text extraction | OCR fallback |
|---|---|---|
| `application/pdf` | ✅ via pdf-parse | 🔶 Stub (not wired) |
| `image/jpeg` | ❌ | 🔶 Stub (not wired) |
| `image/png` | ❌ | 🔶 Stub (not wired) |
| `image/webp` | ❌ | 🔶 Stub (not wired) |
| `application/msword` (.doc) | ❌ Unsupported | ❌ |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx) | ❌ Unsupported | ❌ |

**In practice:** Only born-digital PDFs produce usable extracted text today. Scanned/image-only PDFs produce very short, low-confidence output and the OCR fallback is not yet production-deployed.

---

## 4. PDF support

- Born-digital PDFs (text layer present): ✅ extracted via `pdf-parse`.
- Scanned PDFs (image-only): ⚠️ native extraction returns too-short/low-confidence text. Router recommends OCR but stub is not wired.
- Extraction is **asynchronous**: a `document_extraction_runs` row is queued, the worker picks it up within the next poll cycle (default every 5 seconds).

---

## 5. Image support

Images (JPEG, PNG, WebP) are **not extractable today**. The OCR fallback stub supports the interface but throws `OcrNotConfiguredError` unless `OCR_FALLBACK_ENABLED=true` **and** OCRmyPDF + Tesseract are installed on the worker host.

- Do not promise OCR/image text reading in the current epic.
- Meter reading photos, handover photos, and notarial scans are stored as documents but their text content is not available unless a user uploads a born-digital PDF version.

---

## 6. Extraction mode: async (worker-based)

The extraction worker is a Node.js long-running process, **not** a Supabase Edge Function. It:

1. Polls `document_extraction_runs` for `status = 'queued'` rows (up to 5 at a time).
2. Downloads the file from Supabase Storage using the service role key.
3. Routes to the appropriate extractor.
4. Evaluates quality.
5. Upserts into `document_extractions` (unique per `account_id, document_id, extractor, source_hash`).
6. Marks the run `completed` or `failed`.
7. Writes to `document_audit_log` at each step.

**No real-time extraction.** The Lease Auditor page polls/re-fetches to detect when extraction completes.

---

## 7. Where extracted text is stored

```sql
-- Table: document_extractions
id uuid PRIMARY KEY
account_id uuid              -- scoped, RLS-protected
document_id uuid             -- FK documents
extractor text               -- 'native_pdf' | 'ocrmypdf_tesseract' | ...
status text                  -- 'completed' | 'failed' | 'stale'
text_content text            -- ← FULL EXTRACTED TEXT (can be very large)
markdown_content text        -- null for native PDF
page_count integer
confidence_score numeric     -- 0.0 to 1.0
quality_flag text            -- 'too_short' | 'low_confidence' | 'ok' | 'good'
character_count integer
source_hash text             -- SHA-256 of file bytes (dedup key)
structured_payload jsonb     -- quality metadata + recommended_extractor
completed_at timestamptz
```

**Access:** RLS restricts `document_extractions` to `user_can_manage_account(account_id)`. Extracted text is **never** exposed to tenants or contractors.

---

## 8. How Lease Auditor consumes extracted text

1. Frontend calls `getLeaseExtraction(accountId, leaseId)` → hits `get_lease_extraction()` RPC.
2. RPC joins `leases → documents (via tenant_id OR property_id) → document_extractions` and returns the best completed extraction (ordered by `character_count DESC`).
3. Edge function `generate-lease-clause-audit` receives `leaseAuditId`, re-calls `get_lease_extraction()` to get `text_content`.
4. Sends text to OpenAI wrapped in `buildUntrustedJsonPrompt()` (marks all property/tenant data as untrusted).
5. OpenAI returns clause findings array → bulk-inserted into `lease_audit_findings`.

**The same pattern is reused for Poland Compliance AI suggestions** (`suggest-checklist-item-match`), adapted to match checklist items rather than identify risky clauses.

---

## 9. Privacy and security implications

| Concern | Current mitigation |
|---|---|
| Extracted text exposed cross-account | RLS on `document_extractions` — `user_can_manage_account()` required |
| Extracted text exposed to tenants | Visibility check in storage policies — tenants have no access to `document_extractions` |
| Extracted text sent to OpenAI | Wrapped in `buildUntrustedJsonPrompt()` — property/tenant aliases, not real names |
| Duplicate file storage | Dedup by `source_hash` — same file never extracts twice |
| AI hallucination treated as legal fact | All AI output is labelled as suggestion; user confirmation required before any action |
| Image OCR (if enabled) could expose PII | OCR disabled by default; would require opt-in + infrastructure decision |

---

## 10. Safe next steps for this epic

| Feature | Safe to build? | Notes |
|---|---|---|
| Evidence pack view (completeness from checklist items) | ✅ Yes | No extraction needed — derives from `compliance_checklist_items.status` + `evidence_document_id` |
| Link existing document to checklist item | ✅ Yes | Uses existing `update_checklist_item_evidence` RPC (cross-account guard already in place) |
| AI match suggestion from extracted text | ✅ Yes, for PDFs only | Only when `document_extractions` row exists with `quality_flag = 'ok'` or `'good'` |
| AI suggestion from document name/tags | ✅ Yes | Name-based, no extraction needed |
| Handover protocol form (text fields, room notes) | ✅ Yes | New table; standard RLS pattern |
| Manual meter readings | ✅ Yes | New table; standard RLS pattern |
| Photo/image evidence attachment | ✅ Yes | Stored as document; text not extracted |
| OCR of meter reading photos | ❌ Not this epic | OCR stub not wired; requires infrastructure decision |
| PDF export of evidence pack | ❌ Not this epic | No safe export pattern exists in OASIS today; add placeholder UI only |
| DOCX extraction | ❌ Not this epic | Unsupported format |

---

## 11. Dependencies for production OCR (future)

If image OCR is desired in a future epic, the following must be resolved:

1. **Infrastructure decision:** OCRmyPDF requires a system dependency (Python + Tesseract). Not available in standard Supabase Edge Function environment. Must run on the Node.js worker host or a dedicated microservice.
2. **Language packs:** Polish text (notarial declarations, handover protocols) requires Tesseract `pol` language pack (`OCR_FALLBACK_ENABLED=true` + `tesseract-lang-pol` installed).
3. **Privacy review:** Image OCR may extract PII (names, addresses, PESEL numbers from declarations). Requires a data processing decision before enabling.
4. **Quality bar:** OCR confidence thresholds should be set conservatively for legal documents.

---

*Last updated: 2026-05-12. Review when OCR or new extractors are added.*
