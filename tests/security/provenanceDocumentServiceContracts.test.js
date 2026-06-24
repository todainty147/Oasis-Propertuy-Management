import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provenance document service contracts (Sprint 3)", () => {
  const sql = readSource("supabase/provenance_document_service.sql");
  const eventsSql = readSource("supabase/provenance_events.sql");

  describe("architecture: one ledger only", () => {
    it("does NOT create a second provenance table", () => {
      expect(sql).not.toMatch(
        /create table.*provenance_document_events/i,
      );
    });

    it("writes all events to existing provenance_events via entity_type 'document'", () => {
      expect(sql).toContain("'document', p_entity_id");
    });

    it("reuses existing sequence allocation via provenance_event_counters", () => {
      expect(sql).toContain("insert into public.provenance_event_counters");
      expect(sql).toContain("next_sequence - 1 into v_sequence_number");
    });

    it("reuses existing advisory lock for serialization", () => {
      expect(sql).toContain(
        "pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0)",
      );
    });

    it("does NOT create a second hash chain or sequence system", () => {
      expect(sql).not.toMatch(/create table.*document_event_counters/i);
      expect(sql).not.toMatch(/create table.*document_chain/i);
    });

    it("reuses existing chain verification in timeline RPC", () => {
      expect(sql).toContain("provenance_chain_status");
      expect(sql).toContain("verify_provenance_anchor");
    });
  });

  describe("document identity model", () => {
    it("adds document_family_id column to documents table", () => {
      expect(sql).toContain(
        "alter table public.documents\n  add column if not exists document_family_id uuid",
      );
    });

    it("adds version_number column to documents table", () => {
      expect(sql).toContain(
        "add column if not exists version_number integer not null default 1",
      );
    });

    it("backfills document_family_id to self for existing documents", () => {
      expect(sql).toContain("set document_family_id = id");
      expect(sql).toContain("where document_family_id is null");
    });

    it("creates index on document_family_id", () => {
      expect(sql).toContain("idx_documents_family_id");
    });
  });

  describe("internal validation helper", () => {
    it("defines _validate_document_provenance_context", () => {
      expect(sql).toContain("_validate_document_provenance_context");
    });

    it("validates document exists", () => {
      expect(sql).toContain("'document not found'");
    });

    it("resolves account_id, property_id, tenant_id from document", () => {
      const fn = sql.match(
        /create or replace function public\._validate_document_provenance_context[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_account_id");
      expect(fn[0]).toContain("v_property_id");
      expect(fn[0]).toContain("v_tenant_id");
    });

    it("resolves tenancy from active lease", () => {
      const fn = sql.match(
        /create or replace function public\._validate_document_provenance_context[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("public.leases l");
      expect(fn[0]).toContain("v_tenancy_id");
    });

    it("is revoked from all API roles (internal only)", () => {
      expect(sql).toContain(
        "revoke all on function public._validate_document_provenance_context(uuid)",
      );
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fn = sql.match(
        /create or replace function public\._validate_document_provenance_context[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fn).not.toBeNull();
    });
  });

  describe("internal append helper", () => {
    it("defines _append_document_provenance_event", () => {
      expect(sql).toContain("_append_document_provenance_event");
    });

    it("is revoked from all API roles", () => {
      expect(sql).toContain(
        "revoke all on function public._append_document_provenance_event",
      );
    });

    it("inserts into provenance_events with entity_type 'document'", () => {
      const fn = sql.match(
        /create or replace function public\._append_document_provenance_event[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("insert into public.provenance_events");
      expect(fn[0]).toContain("'document'");
    });

    it("supports idempotency key", () => {
      const fn = sql.match(
        /create or replace function public\._append_document_provenance_event[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("p_idempotency_key");
      expect(fn[0]).toContain("idempotency_key = p_idempotency_key");
    });
  });

  describe("event type: document.uploaded", () => {
    it("defines record_document_uploaded", () => {
      expect(sql).toContain("record_document_uploaded");
    });

    it("requires authentication", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'authentication required'");
    });

    it("requires operator role (owner/admin/staff)", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'account operator role required'");
    });

    it("captures document metadata including family_id and version", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document_family_id'");
      expect(fn[0]).toContain("'document_version_id'");
      expect(fn[0]).toContain("'filename'");
      expect(fn[0]).toContain("'mime_type'");
      expect(fn[0]).toContain("'file_size'");
    });

    it("is idempotent per document", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document.uploaded:' || p_document_id");
    });

    it("is granted to authenticated", () => {
      expect(sql).toContain(
        "grant execute on function public.record_document_uploaded(uuid) to authenticated",
      );
    });
  });

  describe("event type: document.served_asserted", () => {
    it("defines record_document_served_asserted with required metadata", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_asserted[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'service_method'");
      expect(fn[0]).toContain("'recipient_hash'");
      expect(fn[0]).toContain("'asserted_service_date'");
      expect(fn[0]).toContain("'asserted_by_user'");
      expect(fn[0]).toContain("'supporting_evidence_reference'");
    });

    it("validates service_method and recipient are non-empty", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_asserted[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'service_method is required'");
      expect(fn[0]).toContain("'recipient is required'");
    });

    it("uses summary wording: Landlord-recorded service assertion", () => {
      expect(sql).toContain("'Landlord-recorded service assertion'");
    });

    it("requires operator role", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_asserted[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'account operator role required'");
    });
  });

  describe("event type: document.served_system", () => {
    it("defines record_document_served_system with required metadata", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'recipient_user_id'");
      expect(fn[0]).toContain("'recipient_email_hash'");
      expect(fn[0]).toContain("'notification_id'");
      expect(fn[0]).toContain("'provider_message_id'");
      expect(fn[0]).toContain("'send_status'");
      expect(fn[0]).toContain("'sent_at'");
    });

    it("uses summary wording: Service sent by Tenaqo", () => {
      expect(sql).toContain("'Service sent by Tenaqo'");
    });

    it("uses actor_type system with source_type notification", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'system', null, 'system'");
      expect(fn[0]).toContain("'notification'");
    });
  });

  describe("delivery status composition", () => {
    it("defines record_document_delivery_confirmed", () => {
      expect(sql).toContain("record_document_delivery_confirmed");
    });

    it("uses summary: Delivery confirmed by provider", () => {
      expect(sql).toContain("'Delivery confirmed by provider'");
    });

    it("defines record_document_service_failed", () => {
      expect(sql).toContain("record_document_service_failed");
    });

    it("uses summary: Service attempt failed", () => {
      expect(sql).toContain("'Service attempt failed'");
    });

    it("does NOT mutate served_system events (separate immutable events)", () => {
      expect(sql).not.toMatch(
        /update\s+.*provenance_events.*set.*event_type.*delivery/i,
      );
    });
  });

  describe("event type: document.available", () => {
    it("defines record_document_available with required metadata", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_available[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'access_grant_id'");
      expect(fn[0]).toContain("'access_channel'");
      expect(fn[0]).toContain("'available_from'");
      expect(fn[0]).toContain("'available_until'");
      expect(fn[0]).toContain("'tenant_user_id'");
    });

    it("validates tenant belongs to the account", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_available[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'invalid tenant for this account'");
    });
  });

  describe("event type: document.viewed (debounced)", () => {
    it("defines record_document_viewed for tenant callers", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_viewed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'tenant access required'");
    });

    it("uses 30-minute debounce window via idempotency key", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_viewed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("_document_debounce_window");
      expect(fn[0]).toContain("'document.viewed:' || p_document_id");
    });

    it("includes document_version_id and tenant_user_id in idempotency key", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_viewed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("p_document_id::text");
      expect(fn[0]).toContain("p_tenant_user_id::text");
      expect(fn[0]).toContain("v_window");
    });

    it("blocks successor tenant from accessing prior tenant evidence", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_viewed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document not accessible to this tenant'");
    });

    it("uses actor_role 'tenant'", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_viewed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'human', p_tenant_user_id, 'tenant'");
    });

    it("summary: Tenant viewed this document", () => {
      expect(sql).toContain("'Tenant viewed this document'");
    });
  });

  describe("debounce window helper", () => {
    it("defines _document_debounce_window as immutable", () => {
      const fn = sql.match(
        /create or replace function public\._document_debounce_window[\s\S]*?immutable/,
      );
      expect(fn).not.toBeNull();
    });

    it("uses 30-minute floor bucketing", () => {
      expect(sql).toContain("floor(extract(minute from p_timestamp) / 30)");
      expect(sql).toContain("interval '30 minutes'");
    });
  });

  describe("event type: document.downloaded (debounced)", () => {
    it("defines record_document_downloaded with same 30-minute debounce", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_downloaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("_document_debounce_window");
      expect(fn[0]).toContain("'document.downloaded:'");
    });

    it("captures download_route in metadata", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_downloaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'download_route'");
    });

    it("summary: Tenant downloaded this document", () => {
      expect(sql).toContain("'Tenant downloaded this document'");
    });
  });

  describe("event type: document.acknowledged", () => {
    it("defines record_document_acknowledged with required fields", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'acknowledgement_text'");
      expect(fn[0]).toContain("'acknowledgement_text_version'");
      expect(fn[0]).toContain("'acknowledgement_method'");
      expect(fn[0]).toContain("'locale'");
      expect(fn[0]).toContain("'access_grant_id'");
    });

    it("stores exact wording shown in metadata", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("p_acknowledgement_text");
    });

    it("validates acknowledgement_text is non-empty", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'acknowledgement_text is required'");
    });

    it("validates acknowledgement_text_version is non-empty", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'acknowledgement_text_version is required'");
    });

    it("deduplicates only network retries via submission_nonce", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("p_submission_nonce");
      expect(fn[0]).toContain("'document.acknowledged:'");
    });

    it("does NOT debounce genuine re-acknowledgements (no time window)", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).not.toContain("_document_debounce_window");
    });

    it("summary: Tenant acknowledged receipt", () => {
      expect(sql).toContain("'Tenant acknowledged receipt'");
    });
  });

  describe("event type: document.expired", () => {
    it("defines record_document_expired", () => {
      expect(sql).toContain("record_document_expired");
    });

    it("is idempotent per document", () => {
      expect(sql).toContain("'document.expired:' || p_document_id");
    });
  });

  describe("event type: document.replaced", () => {
    it("defines record_document_replaced", () => {
      expect(sql).toContain("record_document_replaced");
    });

    it("validates replacement document exists and belongs to same account", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_replaced[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'replacement document not found'");
      expect(fn[0]).toContain("'replacement document must belong to the same account'");
    });

    it("links replacement into the same document family with safe monotonic version", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_replaced[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("set document_family_id = v_ctx.v_document_family_id");
      expect(fn[0]).toContain("version_number = v_next_version");
      expect(fn[0]).toContain("for update");
      expect(fn[0]).toContain("max(d.version_number)");
    });
  });

  describe("event type: document.withdrawn", () => {
    it("defines record_document_withdrawn", () => {
      expect(sql).toContain("record_document_withdrawn");
    });

    it("is idempotent per document", () => {
      expect(sql).toContain("'document.withdrawn:' || p_document_id");
    });
  });

  describe("version isolation", () => {
    it("every event recording function includes document_version_id in metadata", () => {
      const fns = [
        "record_document_uploaded",
        "record_document_served_asserted",
        "record_document_served_system",
        "record_document_delivery_confirmed",
        "record_document_service_failed",
        "record_document_available",
        "record_document_viewed",
        "record_document_downloaded",
        "record_document_acknowledged",
        "record_document_expired",
        "record_document_replaced",
        "record_document_withdrawn",
      ];
      for (const fnName of fns) {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`,
          ),
        );
        expect(fn, `${fnName} should exist`).not.toBeNull();
        expect(fn[0]).toContain("'document_version_id'");
      }
    });

    it("every event recording function includes document_family_id in metadata", () => {
      const fns = [
        "record_document_uploaded",
        "record_document_served_asserted",
        "record_document_served_system",
        "record_document_delivery_confirmed",
        "record_document_service_failed",
        "record_document_available",
        "record_document_viewed",
        "record_document_downloaded",
        "record_document_acknowledged",
        "record_document_expired",
        "record_document_replaced",
        "record_document_withdrawn",
      ];
      for (const fnName of fns) {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`,
          ),
        );
        expect(fn[0]).toContain("'document_family_id'");
      }
    });
  });

  describe("document service projection", () => {
    it("defines document_service_projection", () => {
      expect(sql).toContain("document_service_projection");
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fn).not.toBeNull();
    });

    it("computes all projection states including service_failed and delivery_confirmed", () => {
      for (const state of [
        "withdrawn",
        "expired",
        "replaced",
        "acknowledged",
        "available_downloaded",
        "available_viewed",
        "available_no_access",
        "service_failed",
        "delivery_confirmed",
        "service_recorded",
        "uploaded",
      ]) {
        expect(sql).toContain(`'${state}'`);
      }
    });

    it("computes access evidence strength levels 0-4 using latest service outcome", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_evidence_strength");
      expect(fn[0]).toContain("when v_has_acknowledged then 4");
      expect(fn[0]).toContain("when v_has_viewed or v_has_downloaded then 3");
      expect(fn[0]).toContain("v_latest_service_outcome <> 'failed'");
      expect(fn[0]).toContain("when v_has_uploaded then 1");
    });

    it("returns view_count, download_count, and acknowledgement_count", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'view_count'");
      expect(fn[0]).toContain("'download_count'");
      expect(fn[0]).toContain("'acknowledgement_count'");
    });

    it("returns first_acknowledgement_at", () => {
      expect(sql).toContain("'first_acknowledgement_at'");
    });

    it("is granted to authenticated", () => {
      expect(sql).toContain(
        "grant execute on function public.document_service_projection(uuid) to authenticated",
      );
    });
  });

  describe("timeline RPC", () => {
    it("defines get_document_service_timeline", () => {
      expect(sql).toContain("get_document_service_timeline");
    });

    it("is SECURITY DEFINER with pinned search_path", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?security definer[\s\S]*?set search_path = public/,
      );
      expect(fn).not.toBeNull();
    });

    it("returns document metadata including family and version", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document_family_id'");
      expect(fn[0]).toContain("'document_version'");
    });

    it("returns events with required per-event fields", () => {
      for (const field of [
        "'event_id'",
        "'event_type'",
        "'effective_at'",
        "'recorded_at'",
        "'actor_type'",
        "'actor_role'",
        "'source_type'",
        "'document_version_id'",
        "'safe_metadata_summary'",
        "'evidence_hash'",
        "'is_system_observed'",
        "'is_manual_assertion'",
        "'is_reconstructed'",
      ]) {
        expect(sql).toContain(field);
      }
    });

    it("derives is_reconstructed from source metadata, not hardcoded", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_ev.metadata ->> 'reconstructed'");
      expect(fn[0]).toContain("v_ev.metadata ->> 'source'");
    });

    it("returns access_evidence_strength from projection", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'access_evidence_strength'");
    });

    it("returns ledger_integrity_status and verified_at", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'ledger_integrity_status'");
      expect(fn[0]).toContain("'verified_at'");
    });

    it("returns anchor_summary", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'anchor_summary'");
    });

    it("returns safe_user_message and access_evidence_disclaimer", () => {
      expect(sql).toContain("'safe_user_message'");
      expect(sql).toContain("'access_evidence_disclaimer'");
    });

    it("blocks successor tenant from accessing prior tenant evidence", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document not accessible to this tenant'");
    });

    it("is granted to authenticated", () => {
      expect(sql).toContain(
        "grant execute on function public.get_document_service_timeline(uuid) to authenticated",
      );
    });
  });

  describe("surface wording rules", () => {
    it("uses File unchanged since upload (not authenticity)", () => {
      expect(sql).not.toMatch(/document authenticity verified/i);
      expect(sql).not.toMatch(/legally served/i);
      expect(sql).not.toMatch(/validly served/i);
      expect(sql).not.toMatch(/service proven/i);
      expect(sql).not.toMatch(/tenant definitely received/i);
    });

    it("disclaimer text reflects access record only", () => {
      expect(sql).toContain(
        "This reflects Tenaqo''s access record only and does not determine legal validity of service.",
      );
    });
  });

  describe("retention and privacy", () => {
    it("does NOT delete provenance events (immutability preserved)", () => {
      expect(sql).not.toMatch(
        /delete\s+from\s+.*provenance_events/i,
      );
    });

    it("does NOT update provenance events", () => {
      expect(sql).not.toMatch(
        /update\s+.*provenance_events\s+set/i,
      );
    });
  });

  describe("security: all event functions are SECURITY DEFINER with pinned search_path", () => {
    const fns = [
      "record_document_uploaded",
      "record_document_served_asserted",
      "record_document_served_system",
      "record_document_delivery_confirmed",
      "record_document_service_failed",
      "record_document_available",
      "record_document_viewed",
      "record_document_downloaded",
      "record_document_acknowledged",
      "record_document_expired",
      "record_document_replaced",
      "record_document_withdrawn",
    ];

    for (const fnName of fns) {
      it(`${fnName} is SECURITY DEFINER with pinned search_path`, () => {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public`,
          ),
        );
        expect(fn, `${fnName} should be SECURITY DEFINER`).not.toBeNull();
      });
    }
  });

  describe("security: operator events require owner/admin/staff", () => {
    const operatorFns = [
      "record_document_uploaded",
      "record_document_served_asserted",
      "record_document_available",
      "record_document_expired",
      "record_document_replaced",
      "record_document_withdrawn",
    ];

    for (const fnName of operatorFns) {
      it(`${fnName} requires operator role`, () => {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`,
          ),
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("'account operator role required'");
      });
    }
  });

  describe("security: system/webhook events require service_role", () => {
    const serviceRoleFns = [
      "record_document_served_system",
      "record_document_delivery_confirmed",
      "record_document_service_failed",
      "record_document_viewed",
      "record_document_downloaded",
    ];

    for (const fnName of serviceRoleFns) {
      it(`${fnName} requires service_role`, () => {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`,
          ),
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("service_role required");
      });

      it(`${fnName} is granted only to service_role`, () => {
        expect(sql).toMatch(
          new RegExp(`grant execute on function public\\.${fnName}\\([^)]*\\) to service_role`),
        );
      });
    }
  });

  describe("security: tenant events validate tenant access", () => {
    const tenantFns = [
      "record_document_viewed",
      "record_document_downloaded",
      "record_document_acknowledged",
    ];

    for (const fnName of tenantFns) {
      it(`${fnName} validates tenant access`, () => {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`,
          ),
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("'tenant access required'");
      });

      it(`${fnName} blocks successor tenant`, () => {
        const fn = sql.match(
          new RegExp(
            `create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`,
          ),
        );
        expect(fn).not.toBeNull();
        expect(fn[0]).toContain("'document not accessible to this tenant'");
      });
    }
  });

  describe("security: head-freshness stale detection (Finding 3)", () => {
    it("reads current chain head via get_provenance_chain_head", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("get_provenance_chain_head");
    });

    it("compares stored head_sequence and head_hash to current", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("head_sequence is distinct from");
      expect(fn[0]).toContain("head_hash is distinct from");
    });

    it("returns 'stale' integrity status when head drifts", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("when v_chain_stale then 'stale'");
    });
  });

  describe("security: document visibility enforcement (Finding 4)", () => {
    it("projection checks document visibility for tenant callers", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("document visibility does not permit tenant access");
    });

    it("projection checks successor tenant isolation", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("document not accessible to this tenant");
    });

    it("timeline checks document visibility for tenant callers", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("document visibility does not permit tenant access");
    });

    it("viewed validates document visibility is 'tenant'", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_viewed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("document visibility does not permit tenant access");
    });

    it("downloaded validates document visibility is 'tenant'", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_downloaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("document visibility does not permit tenant access");
    });

    it("acknowledged validates document visibility is 'tenant'", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("document visibility does not permit tenant access");
    });
  });

  describe("security: monotonic version identity (Finding 7)", () => {
    it("creates unique index on (document_family_id, version_number)", () => {
      expect(sql).toContain("idx_documents_family_version");
      expect(sql).toContain("on public.documents(document_family_id, version_number)");
    });
  });

  describe("security: PII minimization in ledger metadata (Finding 8)", () => {
    it("hashes recipient in served_asserted (not raw)", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_asserted[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'recipient_hash'");
      expect(fn[0]).toContain("extensions.digest");
      expect(fn[0]).toContain("'sha256'");
      expect(fn[0]).not.toMatch(/'recipient'[^_]/);
    });

    it("hashes email in served_system (not raw)", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'recipient_email_hash'");
      expect(fn[0]).toContain("extensions.digest");
    });

    it("categorizes failure_reason into failure_category", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_service_failed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'failure_category'");
      expect(fn[0]).toContain("'bounced'");
      expect(fn[0]).toContain("'rejected'");
      expect(fn[0]).toContain("'timeout'");
      expect(fn[0]).toContain("'other'");
    });

    it("does not store raw storage_path in metadata", () => {
      const fns = sql.match(
        /jsonb_build_object\([^;]*\)/g,
      );
      expect(fns).not.toBeNull();
      for (const fnBody of fns) {
        expect(fnBody).not.toContain("'storage_path'");
      }
    });
  });

  describe("security: served_system validates notification record (Finding 1)", () => {
    it("checks notification exists when notification_id is provided", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'referenced notification not found'");
    });

    it("validates notification belongs to the same account", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'notification does not belong to this account'");
    });

    it("validates notification recipient matches the given recipient", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'notification recipient does not match'");
    });

    it("validates notification entity_id references this document", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'notification does not reference this document'");
    });

    it("includes provider_message_id in idempotency key to prevent resend dedup", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_served_system[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("coalesce(p_provider_message_id,");
    });
  });

  describe("security: tenant timeline initialises anchor safely (Finding 1b)", () => {
    it("initialises v_anchor to safe defaults before conditional branch", () => {
      const fn = sql.match(
        /create or replace function public\.get_document_service_timeline[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("false as has_anchor");
      expect(fn[0]).toContain("null::boolean as anchor_consistent");
      expect(fn[0]).toContain("0::bigint as events_after_anchor");
    });
  });

  describe("security: upload status validation (Finding 2)", () => {
    it("validates upload_status is 'uploaded'", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document upload not completed");
      expect(fn[0]).toContain("upload_status");
    });

    it("rejects documents with flagged or failed scan_status", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document failed malware scan");
      expect(fn[0]).toContain("scan_status");
    });

    it("includes scan_pending flag in metadata for pending scans", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'scan_pending'");
      expect(fn[0]).toContain("'pending_scan'");
    });

    it("uses neutral 'transfer completed' wording (not implying safety)", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_uploaded[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'Document transfer completed:");
    });
  });

  describe("security: causal validation for webhook events (Finding 3)", () => {
    it("delivery_confirmed requires a preceding served_system with matching provider_message_id", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_delivery_confirmed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'no preceding served_system event with this provider_message_id'");
      expect(fn[0]).toContain("'document.served_system'");
      expect(fn[0]).toContain("'provider_message_id'");
    });

    it("service_failed requires a preceding served_system with matching provider_message_id", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_service_failed[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'no preceding served_system event with this provider_message_id'");
      expect(fn[0]).toContain("'document.served_system'");
    });
  });

  describe("security: document.available validation (Finding 4)", () => {
    it("validates document visibility is 'tenant'", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_available[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'document visibility must be tenant to make available'");
    });

    it("validates tenant matches document association", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_available[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'tenant does not match document association'");
    });

    it("records as human operator actor, not system", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_available[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'human', v_uid, v_role");
    });
  });

  describe("security: replacement identity protection (Finding 5)", () => {
    it("prevents self-replacement", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_replaced[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'cannot replace a document with itself'");
    });

    it("prevents re-parenting a document with existing provenance", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_replaced[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'replacement document already has provenance history'");
    });

    it("uses family-level advisory lock for version allocation", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_replaced[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("pg_advisory_xact_lock");
      expect(fn[0]).toContain("doc_family:");
    });
  });

  describe("security: acknowledgement text length cap", () => {
    it("rejects acknowledgement_text longer than 2000 characters", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_acknowledged[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("'acknowledgement_text exceeds 2000 characters'");
      expect(fn[0]).toContain("length(btrim(p_acknowledgement_text)) > 2000");
    });
  });

  describe("projection: latest-service-outcome model", () => {
    it("tracks v_latest_service_outcome across service events in sequence order", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_latest_service_outcome text := null");
      expect(fn[0]).toContain("v_latest_service_outcome := 'sent'");
      expect(fn[0]).toContain("v_latest_service_outcome := 'confirmed'");
      expect(fn[0]).toContain("v_latest_service_outcome := 'failed'");
      expect(fn[0]).toContain("v_latest_service_outcome := 'asserted'");
    });

    it("uses latest outcome (not ever-happened) for service_failed status", () => {
      const fn = sql.match(
        /create or replace function public\.document_service_projection[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("v_latest_service_outcome = 'failed'");
      expect(fn[0]).toContain("v_latest_service_outcome = 'confirmed'");
    });
  });

  describe("security: replacement provenance check scoped to account", () => {
    it("includes account_id in the replacement provenance-history query", () => {
      const fn = sql.match(
        /create or replace function public\.record_document_replaced[\s\S]*?\$\$;/,
      );
      expect(fn).not.toBeNull();
      expect(fn[0]).toContain("pe.account_id = v_ctx.v_account_id");
      expect(fn[0]).toContain("pe.entity_id = p_replacement_document_id");
    });
  });

  describe("UI: stale integrity display (Finding 7)", () => {
    const pageSrc = readSource("src/pages/provenance/DocumentServiceTimelinePage.jsx");

    it("renders explicit stale branch with 'Verification out of date'", () => {
      expect(pageSrc).toContain('"stale"');
      expect(pageSrc).toContain("Verification out of date");
    });

    it("uses amber colour for stale state", () => {
      expect(pageSrc).toContain("text-amber-700");
    });
  });

  describe("overlay registration", () => {
    it("is registered in dbApplyRepoSql.js after explain_balance", () => {
      const applyScript = readSource("scripts/dbApplyRepoSql.js");
      expect(applyScript).toContain(
        '"provenance_explain_balance.sql",\n  "provenance_document_service.sql",',
      );
    });

    it("is registered in dbBootstrap.js", () => {
      const bootstrapScript = readSource("scripts/dbBootstrap.js");
      expect(bootstrapScript).toContain("provenance_document_service.sql");
    });
  });

  describe("Sprint 3 frontend contracts", () => {
    const pageSrc = readSource("src/pages/provenance/DocumentServiceTimelinePage.jsx");
    const serviceSrc = readSource("src/services/provenanceDocumentService.js");
    const routesSrc = readSource("src/routes/ManagerRoutes.jsx");

    describe("service layer", () => {
      it("exports getDocumentServiceTimeline", () => {
        expect(serviceSrc).toContain("getDocumentServiceTimeline");
        expect(serviceSrc).toContain("get_document_service_timeline");
      });

      it("exports getDocumentServiceProjection", () => {
        expect(serviceSrc).toContain("getDocumentServiceProjection");
        expect(serviceSrc).toContain("document_service_projection");
      });

      it("exports browser-callable event recording functions only", () => {
        for (const fn of [
          "recordDocumentUploaded",
          "recordDocumentServedAsserted",
          "recordDocumentAvailable",
          "recordDocumentAcknowledged",
          "recordDocumentExpired",
          "recordDocumentReplaced",
          "recordDocumentWithdrawn",
        ]) {
          expect(serviceSrc).toContain(fn);
        }
      });

      it("does NOT export service_role-only functions as browser wrappers", () => {
        for (const fn of [
          "export async function recordDocumentServedSystem",
          "export async function recordDocumentDeliveryConfirmed",
          "export async function recordDocumentServiceFailed",
          "export async function recordDocumentViewed",
          "export async function recordDocumentDownloaded",
        ]) {
          expect(serviceSrc).not.toContain(fn);
        }
      });
    });

    describe("timeline page", () => {
      it("imports getDocumentServiceTimeline", () => {
        expect(pageSrc).toContain("getDocumentServiceTimeline");
      });

      it("reads documentId from route params", () => {
        expect(pageSrc).toContain("useParams");
        expect(pageSrc).toContain("documentId");
      });

      it("renders timeline title", () => {
        expect(pageSrc).toContain("Service &amp; Access Timeline");
        expect(pageSrc).toContain('data-testid="timeline-title"');
      });

      it("renders all 12 event type labels", () => {
        for (const label of [
          "Uploaded",
          "Service Asserted",
          "Service Sent",
          "Delivery Confirmed",
          "Service Failed",
          "Available",
          "Viewed",
          "Downloaded",
          "Acknowledged",
          "Expired",
          "Replaced",
          "Withdrawn",
        ]) {
          expect(pageSrc).toContain(label);
        }
      });

      it("renders access evidence strength meter", () => {
        expect(pageSrc).toContain('data-testid="evidence-strength"');
        expect(pageSrc).toContain("Access Evidence Strength");
        expect(pageSrc).toContain("StrengthMeter");
      });

      it("renders ledger integrity status", () => {
        expect(pageSrc).toContain('data-testid="ledger-integrity"');
        expect(pageSrc).toContain("ledger_integrity_status");
      });

      it("renders anchor summary", () => {
        expect(pageSrc).toContain('data-testid="anchor-summary"');
        expect(pageSrc).toContain("anchor_summary");
      });

      it("renders event timeline", () => {
        expect(pageSrc).toContain('data-testid="event-timeline"');
      });

      it("renders disclaimer", () => {
        expect(pageSrc).toContain('data-testid="access-evidence-disclaimer"');
        expect(pageSrc).toContain("access_evidence_disclaimer");
      });

      it("shows assertion badge for manual assertions", () => {
        expect(pageSrc).toContain("is_manual_assertion");
        expect(pageSrc).toContain("assertion");
      });

      it("shows reconstructed badge for reconstructed events", () => {
        expect(pageSrc).toContain("is_reconstructed");
      });

      it("displays effective and recorded timestamps per event", () => {
        expect(pageSrc).toContain("effective_at");
        expect(pageSrc).toContain("recorded_at");
      });
    });

    describe("route registration", () => {
      it("lazy-imports DocumentServiceTimelinePage", () => {
        expect(routesSrc).toContain("DocumentServiceTimelinePage");
        expect(routesSrc).toContain("pages/provenance/DocumentServiceTimelinePage");
      });

      it("registers route at documents/:documentId/service-timeline", () => {
        expect(routesSrc).toContain("documents/:documentId/service-timeline");
      });
    });
  });

  describe("regression: existing provenance infrastructure unchanged", () => {
    it("provenance_events table definition unchanged", () => {
      expect(eventsSql).toContain("create table if not exists public.provenance_events");
    });

    it("record_provenance_event function exists", () => {
      expect(eventsSql).toContain("record_provenance_event");
    });

    it("hash chain trigger exists", () => {
      expect(eventsSql).toContain("trg_provenance_events_compute_hash");
    });

    it("verify_provenance_chain function exists", () => {
      expect(eventsSql).toContain("verify_provenance_chain");
    });
  });
});
