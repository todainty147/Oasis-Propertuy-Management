-- =============================================================================
-- Document Extraction Pipeline — Foundation
-- =============================================================================
-- Scope: document_extractions table, document_extraction_runs table, RLS,
--        5 client RPCs, updated_at trigger, audit event constraint extension.
--
-- Apply after: baseline_schema.sql, document_audit_scope.sql,
--              account_entitlements.sql, account_branding.sql
--
-- Safety rules enforced here:
--   • Extraction text is visible only to owner/admin/staff (user_can_manage_account).
--   • Tenant/contractor roles are excluded by the RLS policy.
--   • No extracted text is stored in ai_insights.
--   • All write paths go through SECURITY DEFINER RPCs.
--   • The extraction worker uses the service_role key server-side.
-- =============================================================================


-- ─── Extend document_audit_log action constraint ──────────────────────────────
--
-- The baseline schema constrains document_audit_log.action to:
--   'upload' | 'delete' | 'download' | 'update_tags'
-- We extend it to include extraction lifecycle actions.
-- DROP IF EXISTS + ADD makes this idempotent.

alter table public.document_audit_log
  drop constraint if exists document_audit_log_action_check;

alter table public.document_audit_log
  add constraint document_audit_log_action_check
  check (action = any (array[
    'upload',
    'delete',
    'download',
    'update_tags',
    'extraction_requested',
    'extraction_started',
    'extraction_completed',
    'extraction_failed',
    'extraction_viewed',
    'extraction_marked_stale'
  ]));


-- ─── document_extractions ─────────────────────────────────────────────────────
--
-- Stores the result of each extraction attempt. Keyed by
-- (account_id, document_id, extractor, source_hash) so that:
--   • Multiple extractors can run on the same document.
--   • Re-extraction after a document change (new source_hash) creates a new row
--     rather than overwriting the old one.
--   • Historical extraction results are preserved for audit purposes.
--
-- text_content / markdown_content MUST NOT be exposed to tenants or contractors.
-- The RLS policy below enforces this via user_can_manage_account() which only
-- returns true for owner / admin / staff / root — never for tenant/contractor.

create table if not exists public.document_extractions (
  id                 uuid        primary key default gen_random_uuid(),
  account_id         uuid        not null references public.accounts(id)   on delete cascade,
  document_id        uuid        not null references public.documents(id)  on delete cascade,
  extractor          text        not null
    check (extractor in (
      'native_pdf', 'docling', 'ocrmypdf_tesseract',
      'paddleocr', 'olmocr', 'manual'
    )),
  language_hint      text,
  status             text        not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'stale')),
  text_content       text,
  markdown_content   text,
  structured_payload jsonb       not null default '{}',
  confidence_score   numeric(5, 4),
  source_hash        text        not null,
  page_count         integer,
  character_count    integer,
  error_message      text,
  created_by         uuid        references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz,
  unique (account_id, document_id, extractor, source_hash)
);

comment on table public.document_extractions is
  'Extracted text / markdown produced by the document extraction worker. '
  'Source material for AI features (Lease Auditor, document summaries, etc.). '
  'text_content and markdown_content are NEVER exposed to tenant/contractor roles — '
  'the RLS policy (user_can_manage_account) enforces this. '
  'Populated by scripts/documentExtraction/worker.js, not by the React frontend.';

comment on column public.document_extractions.source_hash is
  'SHA-256 hex digest of the raw file bytes at time of extraction. '
  'Uniqueness constraint on (account_id, document_id, extractor, source_hash) '
  'ensures a changed document triggers a new row rather than overwriting.';

comment on column public.document_extractions.structured_payload is
  'Extractor-specific metadata: quality_flag, recommended_extractor, '
  'page_breakdown, language_detected, word_count, etc.';

alter table public.document_extractions enable row level security;

-- Only owner / admin / staff can read extraction rows.
-- Tenant / contractor are excluded because user_can_manage_account() returns
-- false for those roles.
drop policy if exists document_extractions_manage_read on public.document_extractions;
create policy document_extractions_manage_read
  on public.document_extractions
  for select
  to authenticated
  using (public.user_can_manage_account(account_id));

-- Block all direct writes from the client.  All mutations go through
-- SECURITY DEFINER RPCs (request_document_extraction, mark_document_extraction_stale)
-- or through the server-side extraction worker using the service_role key.
drop policy if exists document_extractions_no_direct_write on public.document_extractions;
create policy document_extractions_no_direct_write
  on public.document_extractions
  for all
  to authenticated
  using (false)
  with check (false);

revoke insert, update, delete on public.document_extractions from authenticated;
grant select on public.document_extractions to authenticated;

create index if not exists idx_document_extractions_account_id
  on public.document_extractions (account_id);
create index if not exists idx_document_extractions_document_id
  on public.document_extractions (document_id);
create index if not exists idx_document_extractions_status
  on public.document_extractions (status);
create index if not exists idx_document_extractions_source_hash
  on public.document_extractions (source_hash);
create index if not exists idx_document_extractions_account_document
  on public.document_extractions (account_id, document_id);


-- ─── document_extraction_runs ─────────────────────────────────────────────────
--
-- Append-only log of each extraction attempt / job.
-- Created by request_document_extraction RPC when a user queues a job.
-- Polled and updated by scripts/documentExtraction/worker.js.
-- One run per request; a new request for the same document creates a new run.

create table if not exists public.document_extraction_runs (
  id              uuid        primary key default gen_random_uuid(),
  account_id      uuid        not null references public.accounts(id)   on delete cascade,
  document_id     uuid        not null references public.documents(id)  on delete cascade,
  extraction_id   uuid        references public.document_extractions(id) on delete set null,
  extractor       text        not null,
  status          text        not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'skipped')),
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text,
  metadata        jsonb       not null default '{}',
  created_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now()
);

comment on table public.document_extraction_runs is
  'Append-only log of extraction attempts. '
  'Queued rows are polled and processed by the document extraction worker. '
  'status=queued → processing → completed | failed | skipped. '
  'The worker uses the service_role key to update this table.';

comment on column public.document_extraction_runs.extractor is
  'Requested extractor (may be ''auto'' when the router decides at runtime). '
  'Resolved extractor is stored in document_extractions.extractor.';

comment on column public.document_extraction_runs.metadata is
  'Worker-populated metadata: source_hash, actual_extractor_used, '
  'pdf_page_count, ocr_available, quality_flag, etc.';

alter table public.document_extraction_runs enable row level security;

drop policy if exists document_extraction_runs_manage_read on public.document_extraction_runs;
create policy document_extraction_runs_manage_read
  on public.document_extraction_runs
  for select
  to authenticated
  using (public.user_can_manage_account(account_id));

drop policy if exists document_extraction_runs_no_direct_write on public.document_extraction_runs;
create policy document_extraction_runs_no_direct_write
  on public.document_extraction_runs
  for all
  to authenticated
  using (false)
  with check (false);

revoke insert, update, delete on public.document_extraction_runs from authenticated;
grant select on public.document_extraction_runs to authenticated;

create index if not exists idx_document_extraction_runs_account_id
  on public.document_extraction_runs (account_id);
create index if not exists idx_document_extraction_runs_document_id
  on public.document_extraction_runs (document_id);
create index if not exists idx_document_extraction_runs_status
  on public.document_extraction_runs (status);
create index if not exists idx_document_extraction_runs_created_at
  on public.document_extraction_runs (created_at);


-- ─── updated_at trigger ───────────────────────────────────────────────────────

drop trigger if exists trg_document_extractions_updated_at
  on public.document_extractions;

create trigger trg_document_extractions_updated_at
  before update on public.document_extractions
  for each row execute function public.tg_set_updated_at();


-- ─── request_document_extraction ─────────────────────────────────────────────
--
-- Creates a document_extraction_runs row with status='queued'.
-- The extraction worker polls this table and processes queued rows.
-- Requires: document_extraction feature access (growth tier minimum).
-- Requires: document is uploaded and belongs to the account.
-- Emits:    extraction_requested audit event.

create or replace function public.request_document_extraction(
  p_account_id    uuid,
  p_document_id   uuid,
  p_extractor     text default 'auto',
  p_language_hint text default null
)
returns public.document_extraction_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
  v_doc        public.documents;
  v_extractor  text := lower(trim(coalesce(p_extractor, 'auto')));
  v_run        public.document_extraction_runs;
begin
  perform public.assert_account_feature_access(v_account_id, 'document_extraction');

  select * into v_doc
  from public.documents
  where id = p_document_id
    and account_id = v_account_id
    and upload_status = 'uploaded';

  if not found then
    raise exception 'Document not found or not yet uploaded';
  end if;

  if v_extractor not in (
    'auto', 'native_pdf', 'ocrmypdf_tesseract',
    'docling', 'paddleocr', 'olmocr', 'manual'
  ) then
    raise exception 'Invalid extractor: %. Valid values: auto, native_pdf, ocrmypdf_tesseract, docling, paddleocr, olmocr, manual', v_extractor;
  end if;

  insert into public.document_extraction_runs (
    account_id, document_id, extractor, status, metadata, created_by
  ) values (
    v_account_id,
    p_document_id,
    v_extractor,
    'queued',
    jsonb_build_object(
      'language_hint', p_language_hint,
      'mime_type',     v_doc.mime_type,
      'requested_at',  now()
    ),
    auth.uid()
  )
  returning * into v_run;

  insert into public.document_audit_log (
    document_id, action, performed_by, performed_at,
    account_id, property_id, tenant_id, created_at
  ) values (
    p_document_id,
    'extraction_requested',
    auth.uid(),
    now(),
    v_account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  return v_run;
end;
$$;

comment on function public.request_document_extraction(uuid, uuid, text, text) is
  'Queues a document extraction run. '
  'The extraction worker polls document_extraction_runs for status=queued rows. '
  'Requires document_extraction feature access (growth tier minimum). '
  'p_extractor=auto (default) lets the worker pick the best extractor at runtime.';

revoke all on function public.request_document_extraction(uuid, uuid, text, text) from public;
grant execute on function public.request_document_extraction(uuid, uuid, text, text) to authenticated;


-- ─── get_document_extraction ─────────────────────────────────────────────────
--
-- Returns the best available extraction for a document (most recent completed,
-- falling back to processing / pending / stale).
-- Returns at most 1 row. Read-only (stable) — no audit side-effect.
-- Audit logging for views is done separately via log_document_extraction_viewed,
-- called only when the user explicitly opens the text preview in the UI.

create or replace function public.get_document_extraction(
  p_account_id  uuid,
  p_document_id uuid,
  p_extractor   text default null
)
returns setof public.document_extractions
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'document_extraction');

  if not exists (
    select 1 from public.documents
    where id = p_document_id
      and account_id = v_account_id
  ) then
    raise exception 'Document not found';
  end if;

  return query
  select * from public.document_extractions
  where account_id  = v_account_id
    and document_id = p_document_id
    and (p_extractor is null or extractor = p_extractor)
  order by
    case status
      when 'completed'  then 1
      when 'processing' then 2
      when 'pending'    then 3
      when 'stale'      then 4
      else                   5
    end asc,
    created_at desc
  limit 1;
end;
$$;

comment on function public.get_document_extraction(uuid, uuid, text) is
  'Read-only: returns the best available extraction for a document. '
  'Priority: completed > processing > pending > stale > failed. '
  'Does not log extraction_viewed — call log_document_extraction_viewed separately '
  'when the user explicitly opens the text preview.';

revoke all on function public.get_document_extraction(uuid, uuid, text) from public;
grant execute on function public.get_document_extraction(uuid, uuid, text) to authenticated;


-- ─── log_document_extraction_viewed ──────────────────────────────────────────
--
-- Called by the UI when the user explicitly opens the extracted text preview.
-- Kept separate from get_document_extraction so that background polling and
-- status checks do not generate noisy audit rows before any text is viewed.

create or replace function public.log_document_extraction_viewed(
  p_account_id    uuid,
  p_document_id   uuid,
  p_extraction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'document_extraction');

  if not exists (
    select 1 from public.documents
    where id = p_document_id
      and account_id = v_account_id
  ) then
    raise exception 'Document not found';
  end if;

  insert into public.document_audit_log (
    document_id, action, performed_by, performed_at,
    account_id, created_at
  ) values (
    p_document_id,
    'extraction_viewed',
    auth.uid(),
    now(),
    v_account_id,
    now()
  );
end;
$$;

comment on function public.log_document_extraction_viewed(uuid, uuid, uuid) is
  'Writes an extraction_viewed audit event. Call only when the user intentionally '
  'opens the extracted text preview — not on every status poll.';

revoke all on function public.log_document_extraction_viewed(uuid, uuid, uuid) from public;
grant execute on function public.log_document_extraction_viewed(uuid, uuid, uuid) to authenticated;


-- ─── list_document_extractions ────────────────────────────────────────────────
--
-- Lists all extractions for an account, optionally filtered by status.

create or replace function public.list_document_extractions(
  p_account_id uuid,
  p_status     text    default null,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns setof public.document_extractions
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'document_extraction');
  return query
  select * from public.document_extractions
  where account_id = v_account_id
    and (p_status is null or status = p_status)
  order by created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.list_document_extractions(uuid, text, integer, integer) from public;
grant execute on function public.list_document_extractions(uuid, text, integer, integer) to authenticated;


-- ─── list_document_extraction_runs ───────────────────────────────────────────

create or replace function public.list_document_extraction_runs(
  p_account_id  uuid,
  p_document_id uuid    default null,
  p_status      text    default null,
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns setof public.document_extraction_runs
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'document_extraction');
  return query
  select * from public.document_extraction_runs
  where account_id = v_account_id
    and (p_document_id is null or document_id = p_document_id)
    and (p_status      is null or status      = p_status)
  order by created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.list_document_extraction_runs(uuid, uuid, text, integer, integer) from public;
grant execute on function public.list_document_extraction_runs(uuid, uuid, text, integer, integer) to authenticated;


-- ─── mark_document_extraction_stale ──────────────────────────────────────────
--
-- Marks all active (completed/pending/processing) extractions for a document
-- as stale. Used when a document is replaced or when a re-extraction is forced.
-- Returns the affected extraction rows (post-update).
-- Emits: extraction_marked_stale audit event.

create or replace function public.mark_document_extraction_stale(
  p_account_id  uuid,
  p_document_id uuid
)
returns setof public.document_extractions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
  v_doc        public.documents;
begin
  perform public.assert_account_feature_access(v_account_id, 'document_extraction');

  select * into v_doc
  from public.documents
  where id = p_document_id
    and account_id = v_account_id;

  if not found then
    raise exception 'Document not found';
  end if;

  update public.document_extractions
  set status     = 'stale',
      updated_at = now()
  where document_id = p_document_id
    and account_id  = v_account_id
    and status in ('completed', 'pending', 'processing');

  insert into public.document_audit_log (
    document_id, action, performed_by, performed_at,
    account_id, property_id, tenant_id, created_at
  ) values (
    p_document_id,
    'extraction_marked_stale',
    auth.uid(),
    now(),
    v_account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  return query
  select * from public.document_extractions
  where document_id = p_document_id
    and account_id  = v_account_id
  order by created_at desc;
end;
$$;

comment on function public.mark_document_extraction_stale(uuid, uuid) is
  'Marks completed/pending/processing extractions for a document as stale. '
  'Call this when a document is replaced so the AI Lease Auditor does not '
  'consume outdated extracted text.';

revoke all on function public.mark_document_extraction_stale(uuid, uuid) from public;
grant execute on function public.mark_document_extraction_stale(uuid, uuid) to authenticated;
