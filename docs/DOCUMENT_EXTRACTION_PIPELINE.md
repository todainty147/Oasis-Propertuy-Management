# OASIS Document Extraction Pipeline

**Version:** 1.0 (Foundation)
**Status:** Production-ready foundation. OCR fallback and advanced extractors are opt-in.

---

## Overview

The document extraction pipeline converts uploaded documents (PDFs, images) into machine-readable text that OASIS AI features can consume. It is the foundation for:

- **AI Lease Auditor** — clause analysis, risk identification
- **Document Summaries** — AI-generated summaries of contracts and notices
- **Compliance Document Checks** — validating tax evidence, rental certificates
- **Expiry / Date Extraction** — identifying key dates in leases and notices
- **Tax Evidence Extraction** — linking receipts and invoices to tax records

### Key Design Decisions

| Decision | Rationale |
|---|---|
| No OCR in React | Heavy OCR would block the UI thread and expose file bytes in the browser |
| No OCR in Edge Functions | Edge functions have CPU/memory limits unsuitable for PDF processing |
| No paid OCR APIs | Avoids per-document cost and third-party data exposure |
| Worker process, not serverless | Allows native binary tools (Tesseract, OCRmyPDF) and retry logic |
| Extracted text ≠ ai_insights | `ai_insights` is for AI output cache only; extracted text is source material |
| Tenant/contractor exclusion | Raw document text may contain sensitive legal or financial content |

---

## Architecture

```
Browser (React)
  ↓ request_document_extraction() RPC
Supabase Postgres
  → document_extraction_runs (status=queued)
  ← 200 OK (run row returned)

Node.js Worker (scripts/documentExtraction/worker.js)
  ↓ poll document_extraction_runs WHERE status=queued
  ↓ claim run (optimistic update: queued → processing)
  ↓ download file from storage (service_role)
  ↓ compute SHA-256 source hash
  ↓ extractor router
      → native_pdf (pdf-parse)
      → OCR fallback (OCRmyPDF/Tesseract, if configured)
      → unsupported (clear error)
  ↓ upsert document_extractions
  ↓ update document_extraction_runs (completed/failed)
  ↓ insert document_audit_log event
  ← done

AI Lease Auditor (future)
  ↓ getBestDocumentExtractionForAudit(accountId, documentId)
  ← { status: 'ready', extraction: { text_content, markdown_content, ... } }
```

---

## Database Tables

### `public.document_extractions`

Stores the result of each extraction. Keyed by `(account_id, document_id, extractor, source_hash)` so:
- Multiple extractors can run on the same document.
- A changed document (new source_hash) produces a new row rather than overwriting.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| account_id | uuid | FK → accounts |
| document_id | uuid | FK → documents |
| extractor | text | `native_pdf`, `ocrmypdf_tesseract`, `olmocr`, etc. |
| language_hint | text | ISO 639-1 hint, e.g. `en`, `pl`, `de` |
| status | text | `pending`, `processing`, `completed`, `failed`, `stale` |
| text_content | text | Raw extracted text |
| markdown_content | text | Structured markdown (future, from Docling/olmOCR) |
| structured_payload | jsonb | quality_flag, recommended_extractor, notes |
| confidence_score | numeric(5,4) | 0–1, worker-computed |
| source_hash | text | SHA-256 of file bytes |
| page_count | integer | Number of pages |
| character_count | integer | Length of text_content |
| error_message | text | Set on status=failed |
| completed_at | timestamptz | When extraction finished |

### `public.document_extraction_runs`

Append-only job log, one row per extraction request.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| account_id | uuid | FK → accounts |
| document_id | uuid | FK → documents |
| extraction_id | uuid | FK → document_extractions (set on completion) |
| extractor | text | Requested extractor (may be `auto`) |
| status | text | `queued`, `processing`, `completed`, `failed`, `skipped` |
| started_at | timestamptz | When worker claimed the job |
| completed_at | timestamptz | When worker finished |
| error_message | text | Set on failure |
| metadata | jsonb | source_hash, actual_extractor_used, quality_flag |

---

## Security Model

### RLS Policies

Both tables use `user_can_manage_account(account_id)` for SELECT:

```
owner / admin / staff / root → can read
tenant / contractor          → cannot read (policy returns false)
```

Direct INSERT/UPDATE/DELETE from client is blocked. All mutations go through:
- `request_document_extraction` RPC (queues a run)
- `mark_document_extraction_stale` RPC (marks extractions stale)
- The server-side worker via service_role key

### Why tenants can't see extracted text by default

Documents can contain sensitive legal, financial, or personal information. The extracted text is source material for internal AI tools. Tenants already have access to the document file itself via signed URLs — they do not need access to the parsed text.

If a specific use case requires showing extracted text to a tenant (e.g., a signed lease summary), that feature should be implemented as a separate, purpose-limited endpoint with explicit visibility controls.

### Worker service_role access

The worker uses `SUPABASE_SERVICE_KEY` (service_role) to:
- Bypass RLS when reading from `document_extraction_runs`
- Download files from the `documents` storage bucket
- Write to `document_extractions`, `document_extraction_runs`, `document_audit_log`

**Never commit `SUPABASE_SERVICE_KEY` to source control. Never expose it in the browser.**

---

## Audit Events

All extraction events are written to `document_audit_log`:

| Action | Written by | When |
|---|---|---|
| `extraction_requested` | `request_document_extraction` RPC | User queues a job |
| `extraction_started` | Worker | Job claimed for processing |
| `extraction_completed` | Worker | Extraction succeeded |
| `extraction_failed` | Worker | Extraction failed |
| `extraction_viewed` | `get_document_extraction` RPC | Manager reads extracted text |
| `extraction_marked_stale` | `mark_document_extraction_stale` RPC | User marks extractions stale |

---

## Feature Gating

Document extraction is gated at the **growth** tier via `assert_account_feature_access(account_id, 'document_extraction')`.

| Feature Key | Plan | Notes |
|---|---|---|
| `document_extraction` | growth | Foundation: queue, view, stale-mark |
| `ai_lease_auditor` | pro | AI analysis built on top of extraction |
| `ai_document_summaries` | pro | AI summaries built on top of extraction |

---

## Extractor Decision Tree

```
Incoming document
  │
  ├─ MIME not supported → status=skipped, error='Unsupported MIME type'
  │
  ├─ p_extractor='auto' (default)
  │    │
  │    ├─ application/pdf → native_pdf
  │    │    ├─ quality: good/ok → done
  │    │    └─ quality: poor
  │    │         ├─ OCR_FALLBACK_ENABLED=true → ocrmypdf_tesseract
  │    │         └─ OCR not available → native_pdf result + metadata:
  │    │              { recommended_extractor: 'ocrmypdf_tesseract',
  │    │                reason: 'low_confidence_or_scanned_pdf' }
  │    │
  │    └─ image/* → ocrmypdf_tesseract (if available)
  │
  └─ p_extractor specified → run that extractor directly
```

---

## Local Setup

### 1. Prerequisites

- Node.js 18+
- A Supabase project with the `document_extraction_foundation.sql` migration applied

### 2. Apply the migration

Run in the Supabase SQL Editor or via CLI:

```
supabase/document_extraction_foundation.sql
supabase/account_entitlements.sql  (already has document_extraction key)
```

### 3. Install worker dependencies

```bash
cd scripts/documentExtraction
npm install
```

This installs `@supabase/supabase-js` and `pdf-parse` (for native PDF extraction).

### 4. Configure environment

Create `scripts/documentExtraction/.env` (never commit):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
OCR_FALLBACK_ENABLED=false
WORKER_POLL_INTERVAL=5000
```

### 5. Run the worker

```bash
# Continuous poll
node worker.js

# Process one batch and exit (useful for testing)
node worker.js --once
```

---

## OCRmyPDF / Tesseract Setup (Optional)

OCR fallback is disabled by default. To enable it:

### Install system dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get install -y tesseract-ocr tesseract-ocr-pol tesseract-ocr-deu ocrmypdf
```

**macOS:**
```bash
brew install tesseract ocrmypdf
brew install tesseract-lang  # for Polish, German, etc.
```

### Enable in worker

```
OCR_FALLBACK_ENABLED=true
```

The worker will now fall back to OCRmyPDF when native PDF extraction produces low-quality text.

---

## Adding olmOCR (Future, Advanced)

olmOCR provides high-quality layout-aware OCR for complex documents. When ready:

1. Add `olmocr` to the extractor router in `scripts/documentExtraction/extractors/router.js`
2. Create `scripts/documentExtraction/extractors/olmocr.js` implementing the interface
3. Add an environment check (`OLMOCR_ENABLED=true`) similar to OCR fallback
4. Gate it via a new feature key `document_extraction_advanced` at the `pro` tier if GPU cost justifies it

The `document_extractions.extractor` check constraint already includes `'olmocr'`, so no DB migration is needed.

Similarly for **PaddleOCR** (`'paddleocr'`) and **Docling** (`'docling'`).

---

## AI Lease Auditor Integration

The Lease Auditor should **not** read `document_extractions` directly. Instead, use:

```js
import { getBestDocumentExtractionForAudit } from "../services/documentExtractionService";

const result = await getBestDocumentExtractionForAudit(accountId, documentId);

switch (result.status) {
  case "ready":
    // result.extraction.text_content is available for AI analysis
    break;
  case "extraction_required":
    // Prompt the user to run extraction first
    break;
  case "advanced_extraction_recommended":
    // Extraction exists but low quality — show warning and option to re-run with OCR
    break;
  case "extraction_in_progress":
    // Show spinner / poll
    break;
  case "stale_extraction":
    // Document changed — prompt re-extraction
    break;
  case "extraction_failed":
    // Show error: result.error_message
    break;
}
```

---

## Known Limitations

| Limitation | Impact | Workaround / Future Fix |
|---|---|---|
| OCR requires system binaries not in repo | Scanned PDFs return low-quality extraction | Install OCRmyPDF + Tesseract, set `OCR_FALLBACK_ENABLED=true` |
| Worker is not auto-deployed | Extraction only works when worker is running | Add worker to deployment pipeline (Docker, PM2, cron) |
| No markdown output from native extraction | AI Lease Auditor gets plain text only | Add Docling or olmOCR for structured output |
| No DOCX extraction | DOCX files return `status=skipped` | Add `mammoth` npm package for DOCX text extraction |
| Worker runs as single process | Low throughput for bulk extraction | Add FOR UPDATE SKIP LOCKED query if needed for scale |
| source_hash not set until worker runs | UI shows "Not extracted" until worker processes the run | Expected — show "Queued" badge while run is in progress |

---

## No External Paid APIs

This pipeline uses only:
- `pdf-parse` (MIT license, no external API calls)
- OCRmyPDF + Tesseract (GPL/Apache, local processing)
- Future: olmOCR (local model inference, no API calls)

No document bytes are sent to external services. All processing is local.
