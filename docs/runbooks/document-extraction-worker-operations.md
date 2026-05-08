# Document Extraction Worker Operations

Use this when extracted text is missing or stale, jobs are stuck in queue, a PDF returns low-quality results, or you need to set the worker up for the first time.

## What this slice does

The extraction worker is a long-running Node.js process that converts uploaded documents into machine-readable text for AI features (Lease Auditor, document summaries, compliance checks). It is a server-side process — not an Edge Function and not part of the React app.

The worker:

- polls `document_extraction_runs` for rows with `status = 'queued'`
- claims each job atomically (optimistic `queued → processing` update)
- downloads the file from Supabase Storage using the service_role key
- routes to `native_pdf` (pdf-parse) or `ocrmypdf_tesseract` based on MIME type and quality
- writes the result to `document_extractions`
- marks the run `completed`, `failed`, or `skipped`
- appends an event to `document_audit_log`

Document extraction is gated at the **growth** plan tier. Tenants and contractors cannot read extracted text regardless of plan.

## Runtime pieces

Worker entry point:

- [scripts/documentExtraction/worker.js](/mnt/c/Users/Home/oasisrentalmanagementapp/scripts/documentExtraction/worker.js)

Extractor router:

- [scripts/documentExtraction/extractors/router.js](/mnt/c/Users/Home/oasisrentalmanagementapp/scripts/documentExtraction/extractors/router.js)

Required SQL migration:

- [supabase/document_extraction_foundation.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_extraction_foundation.sql)

Architecture reference:

- [docs/DOCUMENT_EXTRACTION_PIPELINE.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/DOCUMENT_EXTRACTION_PIPELINE.md)

## First-time setup

### 1. Apply the migration

Run in the Supabase SQL Editor or via CLI. Apply in this order:

```
supabase/document_extraction_foundation.sql
supabase/account_entitlements.sql
```

`account_entitlements.sql` already includes the `document_extraction` feature key at the `growth` tier — no separate change needed.

Verify the tables exist:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('document_extractions', 'document_extraction_runs');
```

### 2. Install worker dependencies

```bash
cd scripts/documentExtraction
npm install
```

Installs `@supabase/supabase-js` and `pdf-parse`. Node.js 18 or later is required.

### 3. Create the environment file

Create `scripts/documentExtraction/.env`. Never commit this file.

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
OCR_FALLBACK_ENABLED=false
WORKER_POLL_INTERVAL=5000
WORKER_MAX_ATTEMPTS=3
```

`SUPABASE_SERVICE_KEY` is the service_role key from **Supabase → Project Settings → API**. It bypasses RLS. Do not use the anon key here.

Optional variables:

| Variable | Default | Purpose |
|---|---|---|
| `OCR_FALLBACK_ENABLED` | `false` | Enable OCRmyPDF when native PDF quality is poor |
| `WORKER_POLL_INTERVAL` | `5000` | Milliseconds between poll cycles |
| `WORKER_MAX_ATTEMPTS` | `3` | Max retry attempts before a job is left failed |

### 4. Run the worker

```bash
# Continuous polling (production)
node worker.js

# Process one batch and exit (smoke test / CI)
node worker.js --once
```

Or use the package scripts:

```bash
npm start         # continuous
npm run start:once
```

Expected startup output:

```
[worker] OASIS document extraction worker starting.
[worker] Poll interval: 5000ms | Max attempts: 3 | Run once: false
```

If the worker exits immediately with a FATAL error, `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` is missing or wrong.

### 5. Verify a run end-to-end

1. Upload a PDF to any document request in the app.
2. Open `Documents` and trigger extraction from the `DocumentExtractionPanel`.
3. Check the run was queued:

```sql
select id, status, extractor, created_at, error_message
from public.document_extraction_runs
where account_id = '<account_id>'
order by created_at desc
limit 10;
```

4. Wait one poll cycle (default 5 s). Confirm the run moved to `completed`:

```sql
select r.status, r.error_message,
       e.extractor, e.confidence_score, e.character_count, e.status as extraction_status
from public.document_extraction_runs r
left join public.document_extractions e on e.id = r.extraction_id
where r.account_id = '<account_id>'
order by r.created_at desc
limit 5;
```

A healthy row has `r.status = 'completed'` and `e.character_count > 0`.

## Production deployment

The worker is a plain Node.js process. It is not auto-deployed by Supabase or Vite.

**PM2 (recommended for VPS / EC2):**

```bash
npm install -g pm2

# Smoke test first. This loads scripts/documentExtraction/.env into the shell.
cd /path/to/scripts/documentExtraction
set -a
. .env
set +a
node worker.js --once

# Continuous production process. Use the real absolute path on the VPS.
pm2 start bash --name oasis-extraction -- -lc 'cd /path/to/scripts/documentExtraction && set -a && . .env && set +a && exec node worker.js'
pm2 save
pm2 startup  # follow the output to enable on reboot
```

After `pm2 startup`, run `pm2 save` again so the corrected process list is resurrected after a reboot.

Common PM2 operations:

```bash
pm2 list
pm2 logs oasis-extraction --lines 50
pm2 restart oasis-extraction
pm2 flush oasis-extraction
pm2 delete oasis-extraction
pm2 save
```

Expected healthy PM2 log output:

```
[worker] OASIS document extraction worker starting.
[worker] Poll interval: 5000ms | Max attempts: 3 | Run once: false
```

If logs still show old errors after a fix, clear them with `pm2 flush oasis-extraction`, restart, and inspect fresh lines with `pm2 logs oasis-extraction --lines 50`.

**Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY scripts/documentExtraction/ .
RUN npm ci --omit=dev
ENV SUPABASE_URL=""
ENV SUPABASE_SERVICE_KEY=""
CMD ["node", "worker.js"]
```

Pass `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as container secrets, not build args.

**Systemd (Linux server):**

```ini
[Unit]
Description=OASIS Document Extraction Worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/scripts/documentExtraction
EnvironmentFile=/path/to/scripts/documentExtraction/.env
ExecStart=/usr/bin/node worker.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## OCR fallback setup (optional)

OCR fallback is disabled by default. Enable it when scanned PDFs or image files return `quality_flag = 'low_confidence'` or `'too_short'`.

**Ubuntu/Debian:**

```bash
sudo apt-get install -y ocrmypdf tesseract-ocr tesseract-ocr-eng
# Add Polish, German if needed:
sudo apt-get install -y tesseract-ocr-pol tesseract-ocr-deu
```

**macOS:**

```bash
brew install ocrmypdf tesseract
brew install tesseract-lang  # all language packs
```

After installation, verify the binary is on PATH:

```bash
ocrmypdf --version
tesseract --version
```

Then set `OCR_FALLBACK_ENABLED=true` in `.env` and restart the worker.

The router will now fall back to OCRmyPDF automatically when native PDF text is below quality threshold.

## Inspecting run state

### All recent runs for an account

```sql
select id, document_id, extractor, status, started_at, completed_at,
       error_message, metadata->>'quality_flag' as quality_flag,
       metadata->>'character_count' as chars
from public.document_extraction_runs
where account_id = '<account_id>'
order by created_at desc
limit 20;
```

### Runs stuck in processing (worker crash mid-job)

```sql
select id, document_id, extractor, started_at,
       now() - started_at as age
from public.document_extraction_runs
where status = 'processing'
  and started_at < now() - interval '10 minutes';
```

Any row here was claimed by a worker that likely crashed. Reset it:

```sql
update public.document_extraction_runs
set status = 'queued', started_at = null
where id = '<run_id>'
  and status = 'processing';
```

This re-exposes the job to the next poll cycle.

### Extraction quality breakdown

```sql
select extractor, status,
       structured_payload->>'quality_flag' as quality_flag,
       confidence_score, character_count, page_count,
       created_at
from public.document_extractions
where account_id = '<account_id>'
  and document_id = '<document_id>'
order by created_at desc;
```

Expected values for `quality_flag`: `good`, `ok`, `too_short`, `low_confidence`.

`too_short` and `low_confidence` indicate the document is likely scanned. Enable OCR fallback or re-run with `extractor = 'ocrmypdf_tesseract'` explicitly.

### Audit trail for a document

```sql
select action, performed_at, metadata
from public.document_audit_log
where account_id = '<account_id>'
  and document_id = '<document_id>'
  and action like 'extraction_%'
order by performed_at desc;
```

Expected sequence: `extraction_requested` → `extraction_started` → `extraction_completed`.

## Common problems

### Extraction panel shows "Not extracted" and nothing is queued

The user triggered extraction but no run row exists.

Check:

1. The account is on the growth plan or above.
2. `request_document_extraction` RPC is present — confirm the `document_extraction_foundation.sql` migration was applied.
3. The document `upload_status = 'uploaded'` (not `pending` or `failed`):

```sql
select id, upload_status, storage_path, mime_type
from public.documents
where account_id = '<account_id>'
  and id = '<document_id>';
```

### Jobs stuck in `queued` indefinitely

The worker is not running or cannot reach Supabase.

Check:

1. Worker process is running: `ps aux | grep worker` or `pm2 list`.
2. Worker logs for connection errors.
3. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct and the service key has not been rotated.
4. Network connectivity from the worker host to `your-project.supabase.co`.

### PM2 process is `errored` after deployment

Check the logs:

```bash
pm2 logs oasis-extraction --lines 50
```

If the log contains:

```
cd: /path/to/scripts/documentExtraction: No such file or directory
```

the PM2 command was created with the wrong worker path. Delete and recreate the process with the real absolute path:

```bash
pm2 delete oasis-extraction
pm2 start bash --name oasis-extraction -- -lc 'cd /real/path/to/scripts/documentExtraction && set -a && . .env && set +a && exec node worker.js'
pm2 save
pm2 list
```

If the process is `online` but `pm2 logs` still shows the old missing-directory lines, those may be stale log entries. Clear and restart before re-checking:

```bash
pm2 flush oasis-extraction
pm2 restart oasis-extraction
pm2 logs oasis-extraction --lines 50
```

### Node 20 WebSocket startup error

With newer `@supabase/supabase-js` versions on Node 20, startup may fail with:

```
Error: Node.js 20 detected without native WebSocket support.
```

The worker package should include `ws` and pass it as the Supabase realtime transport. If deploying an older checkout, update the worker code or install the dependency before restarting:

```bash
cd scripts/documentExtraction
npm install ws
pm2 restart oasis-extraction
```

The code path should initialize Supabase with:

```js
const WebSocket = require("ws");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});
```

### Run status is `failed` with a storage error

```
Storage download failed for <path>: ...
```

Check:

1. The storage bucket `documents` exists in **Supabase → Storage**.
2. The file was fully uploaded (`upload_status = 'uploaded'` in `documents`).
3. The service_role key has access to the `documents` bucket. Service_role bypasses RLS but the bucket itself must exist.
4. `storage_path` in the `documents` row matches the actual object path in storage.

### Run status is `skipped`

The MIME type is not supported. Currently supported: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.

DOCX files always result in `skipped`. There is no DOCX extractor yet. See [docs/DOCUMENT_EXTRACTION_PIPELINE.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/DOCUMENT_EXTRACTION_PIPELINE.md) for adding `mammoth` when needed.

### Native PDF quality is poor; OCR not configured

The run completes but `quality_flag` is `low_confidence` or `too_short`. The `structured_payload` will contain:

```json
{
  "recommended_extractor": "ocrmypdf_tesseract",
  "reason": "low_confidence_or_scanned_pdf"
}
```

This is expected when `OCR_FALLBACK_ENABLED=false`. Install OCRmyPDF + Tesseract (see OCR setup above) and set `OCR_FALLBACK_ENABLED=true`.

To force a re-run with OCR on a specific document without waiting for auto-routing:

```sql
-- Mark existing extractions stale
select public.mark_document_extraction_stale('<account_id>', '<document_id>');
```

Then trigger extraction again from the UI and confirm the worker picks up the new run.

### Feature unavailable (403 from RPC)

`request_document_extraction` returns an error.

Check the account plan:

```sql
select public.account_subscription_plan('<account_id>');
```

`document_extraction` requires `growth` or above. Starter accounts cannot queue extractions.

Check the entitlement function is up to date:

```sql
select public.account_feature_required_plan('document_extraction');
-- expected: 'growth'
```

If this returns null or errors, re-apply `supabase/account_entitlements.sql`.

### Worker exits immediately

```
[worker] FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.
```

The `.env` file is missing or the environment variables are not being loaded. Confirm:

1. The `.env` file is in `scripts/documentExtraction/` (not the repo root).
2. The worker is started from `scripts/documentExtraction/` so dotenv resolves the file correctly, or the variables are injected via your process manager / container environment.

### Audit event warnings while extraction completes

The worker treats audit writes as non-fatal. If logs show:

```
Audit event 'extraction_started' failed: null value in column "performed_by"
Audit event 'extraction_completed' failed: null value in column "performed_by"
```

but the run still logs:

```
Run <run_id> completed | extractor=native_pdf
```

then text extraction succeeded and only the audit row failed. The worker should write `document_audit_log.performed_by` from `document_extraction_runs.created_by`; deploy the current worker code and restart PM2:

```bash
git pull
cd scripts/documentExtraction
npm install
pm2 restart oasis-extraction
pm2 logs oasis-extraction --lines 50
```

## Re-queuing failed jobs

To re-try a failed run without going through the UI:

```sql
update public.document_extraction_runs
set status = 'queued',
    started_at = null,
    completed_at = null,
    error_message = null
where id = '<run_id>'
  and status = 'failed';
```

The worker will pick it up on its next poll cycle.

To re-run extraction for an entire document (including marking existing results stale):

```sql
-- 1. Mark current extractions stale
select public.mark_document_extraction_stale('<account_id>', '<document_id>');

-- 2. Queue a new run (use the authenticated client RPC from the app,
--    or insert directly as service_role for a forced re-run):
insert into public.document_extraction_runs (
  account_id, document_id, extractor, status, created_at
) values (
  '<account_id>', '<document_id>', 'auto', 'queued', now()
);
```

Direct inserts to `document_extraction_runs` from authenticated clients are blocked by RLS. Use the service_role connection or the `request_document_extraction` RPC from the app.
