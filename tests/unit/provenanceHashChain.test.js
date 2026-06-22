import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

function lp(val) {
  if (val === null || val === undefined) return "NULL";
  const s = String(val);
  return `${Buffer.byteLength(s, "utf8")}:${s}`;
}

function utcIso(dateStr) {
  const d = new Date(dateStr);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds() * 1000, 6)}Z`
  );
}

function canonicalPayloadV0(ev) {
  // Canonical field set v0.3 (26 fields).
  return "v0:" + [
    lp(ev.account_id),
    lp(String(ev.sequence_number)),
    lp(ev.entity_type),
    lp(ev.entity_id),
    lp(ev.property_id),
    lp(ev.tenancy_id),
    lp(ev.event_type),
    lp(String(ev.event_version)),
    lp(ev.actor_type),
    lp(ev.actor_user_id),
    lp(ev.actor_role),
    lp(utcIso(ev.occurred_at)),
    lp(utcIso(ev.recorded_at)),
    lp(ev.summary),
    lp(ev.reason),
    lp(ev.metadata_text),
    lp(ev.amount_minor === null ? null : String(ev.amount_minor)),
    lp(ev.currency),
    lp(ev.source_type),
    lp(ev.source_id),
    lp(ev.supersedes_event_id),
    lp(ev.reversal_of_event_id),
    lp(ev.correlation_id),
    lp(ev.causation_id),
    lp(ev.visibility),
    lp(ev.previous_event_hash),
  ].join("|");
}

function sha256hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const GENESIS = "0".repeat(64);

function buildEvent(overrides = {}) {
  return {
    account_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    sequence_number: 1,
    entity_type: "test_entity",
    entity_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    property_id: null,
    tenancy_id: null,
    event_type: "test.recorded",
    event_version: 1,
    actor_type: "human",
    actor_user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    actor_role: "owner",
    occurred_at: "2026-06-20T12:00:00.000Z",
    recorded_at: "2026-06-20T12:00:00.100Z",
    summary: "Test provenance event",
    reason: null,
    metadata_text: "{}",
    amount_minor: null,
    currency: null,
    source_type: null,
    source_id: null,
    supersedes_event_id: null,
    reversal_of_event_id: null,
    correlation_id: null,
    causation_id: null,
    visibility: "internal",
    previous_event_hash: GENESIS,
    ...overrides,
  };
}

describe("provenance hash chain unit tests", () => {
  describe("genesis sentinel", () => {
    it("is exactly 64 hex zeros", () => {
      expect(GENESIS).toBe("0000000000000000000000000000000000000000000000000000000000000000");
      expect(GENESIS).toHaveLength(64);
    });
  });

  describe("length-prefix serializer (provenance_lp)", () => {
    it("encodes null as literal NULL", () => {
      expect(lp(null)).toBe("NULL");
    });

    it("encodes empty string as 0:", () => {
      expect(lp("")).toBe("0:");
    });

    it("uses byte length, not character length, for multibyte characters", () => {
      expect(lp("é")).toBe("2:é");
      expect(lp("€")).toBe("3:€");
      expect(lp("𝕳")).toBe("4:𝕳");
    });

    it("encodes a UUID as 36:<uuid>", () => {
      expect(lp("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(
        "36:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      );
    });
  });

  describe("canonical payload v0.3", () => {
    it("starts with v0: prefix", () => {
      const payload = canonicalPayloadV0(buildEvent());
      expect(payload).toMatch(/^v0:/);
    });

    it("has exactly 26 pipe-separated fields after version prefix", () => {
      const payload = canonicalPayloadV0(buildEvent());
      const afterPrefix = payload.slice(3);
      expect(afterPrefix.split("|")).toHaveLength(26);
    });

    it("produces a deterministic golden vector", () => {
      const ev = buildEvent();
      const payload = canonicalPayloadV0(ev);
      const hash = sha256hex(payload);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      const hash2 = sha256hex(canonicalPayloadV0(buildEvent()));
      expect(hash2).toBe(hash);
    });

    it("changes hash when any canonical field changes", () => {
      const base = buildEvent();
      const baseHash = sha256hex(canonicalPayloadV0(base));

      const mutations = {
        account_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        sequence_number: 2,
        entity_type: "other_entity",
        entity_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        property_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        tenancy_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        event_type: "test.corrected",
        event_version: 2,
        actor_type: "system",
        actor_user_id: null,
        actor_role: "admin",
        occurred_at: "2026-06-20T13:00:00.000Z",
        recorded_at: "2026-06-20T13:00:00.100Z",
        summary: "Different summary",
        reason: "some reason",
        metadata_text: '{"key": "value"}',
        amount_minor: 1500,
        currency: "GBP",
        source_type: "cron",
        source_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        supersedes_event_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        reversal_of_event_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        correlation_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        causation_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        visibility: "account",
        previous_event_hash: sha256hex("different"),
      };

      for (const [field, value] of Object.entries(mutations)) {
        const mutated = buildEvent({ [field]: value });
        const mutatedHash = sha256hex(canonicalPayloadV0(mutated));
        expect(mutatedHash).not.toBe(baseHash);
      }
    });

    it("correctly serializes null vs empty string as distinct values", () => {
      const withNull = canonicalPayloadV0(buildEvent({ reason: null }));
      const withEmpty = canonicalPayloadV0(buildEvent({ reason: "" }));
      expect(withNull).not.toBe(withEmpty);
      expect(withNull).toContain("NULL");
      expect(withEmpty).toContain("0:");
    });

    it("normalizes timestamps to UTC ISO-8601 with microsecond precision", () => {
      const ev = buildEvent({ occurred_at: "2026-06-20T12:00:00.000Z" });
      const payload = canonicalPayloadV0(ev);
      expect(payload).toContain("2026-06-20T12:00:00.000000Z");
    });
  });

  describe("hash chain linking", () => {
    it("genesis event uses the 64-zero sentinel as previous_event_hash", () => {
      const ev1 = buildEvent({ sequence_number: 1, previous_event_hash: GENESIS });
      const payload = canonicalPayloadV0(ev1);
      expect(payload).toContain(GENESIS);
    });

    it("chains events correctly: event N's previous_event_hash = event (N-1)'s event_hash", () => {
      const ev1 = buildEvent({
        sequence_number: 1,
        previous_event_hash: GENESIS,
      });
      const ev1Hash = sha256hex(canonicalPayloadV0(ev1));

      const ev2 = buildEvent({
        sequence_number: 2,
        entity_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        previous_event_hash: ev1Hash,
        summary: "Second event",
      });
      const ev2Hash = sha256hex(canonicalPayloadV0(ev2));

      const ev3 = buildEvent({
        sequence_number: 3,
        entity_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        previous_event_hash: ev2Hash,
        summary: "Third event",
      });
      const ev3Hash = sha256hex(canonicalPayloadV0(ev3));

      expect(ev1Hash).not.toBe(ev2Hash);
      expect(ev2Hash).not.toBe(ev3Hash);
      expect(ev1Hash).not.toBe(ev3Hash);
    });

    it("detects tampered event by hash mismatch", () => {
      const ev1 = buildEvent({
        sequence_number: 1,
        previous_event_hash: GENESIS,
      });
      const ev1Hash = sha256hex(canonicalPayloadV0(ev1));

      const ev2 = buildEvent({
        sequence_number: 2,
        previous_event_hash: ev1Hash,
        summary: "Original summary",
      });
      const ev2Hash = sha256hex(canonicalPayloadV0(ev2));

      const tampered = buildEvent({
        sequence_number: 2,
        previous_event_hash: ev1Hash,
        summary: "Tampered summary",
      });
      const tamperedHash = sha256hex(canonicalPayloadV0(tampered));

      expect(tamperedHash).not.toBe(ev2Hash);
    });

    it("detects chain splice by previous_event_hash mismatch", () => {
      const ev1 = buildEvent({ sequence_number: 1, previous_event_hash: GENESIS });
      const ev1Hash = sha256hex(canonicalPayloadV0(ev1));

      const ev2 = buildEvent({
        sequence_number: 2,
        previous_event_hash: "deadbeef".repeat(8),
        summary: "Spliced event",
      });
      const ev2Payload = canonicalPayloadV0(ev2);

      expect(ev2Payload).not.toContain(ev1Hash);
    });
  });

  describe("cross-account isolation", () => {
    it("produces different hashes for identical events in different accounts", () => {
      const evA = buildEvent({
        account_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      });
      const evB = buildEvent({
        account_id: "11111111-1111-1111-1111-111111111111",
      });
      const hashA = sha256hex(canonicalPayloadV0(evA));
      const hashB = sha256hex(canonicalPayloadV0(evB));
      expect(hashA).not.toBe(hashB);
    });
  });

  describe("SQL source contracts", () => {
    const sql = readSource("supabase/provenance_events.sql");
    const migration = readSource(
      "supabase/migrations/20260622000000_provenance_hash_chain_backfill.sql",
    );

    it("canonical payload function matches between overlay and migration", () => {
      const extractPayloadFn = (src) => {
        const match = src.match(
          /create or replace function public\.provenance_canonical_payload_v0[\s\S]*?\$\$/g,
        );
        return match ? match[0] : null;
      };

      const overlayFn = extractPayloadFn(sql);
      const migrationFn = extractPayloadFn(migration);
      expect(overlayFn).not.toBeNull();
      expect(migrationFn).not.toBeNull();
      expect(overlayFn).toBe(migrationFn);
    });

    it("trigger function matches between overlay and migration", () => {
      const extractTriggerFn = (src) => {
        const match = src.match(
          /create or replace function public\.provenance_compute_hash_before_insert[\s\S]*?\$\$;/g,
        );
        return match ? match[0] : null;
      };

      const overlayFn = extractTriggerFn(sql);
      const migrationFn = extractTriggerFn(migration);
      expect(overlayFn).not.toBeNull();
      expect(migrationFn).not.toBeNull();
      expect(overlayFn).toBe(migrationFn);
    });

    it("backfill uses session_replication_role = replica to bypass triggers", () => {
      expect(migration).toContain("session_replication_role = 'replica'");
      expect(migration).toContain("reset session_replication_role");
    });

    it("backfill only writes null hashes and verifies non-null hashes in place", () => {
      expect(migration).toContain("if v_event.event_hash is null then");
      expect(migration).toContain("chain may have been tampered");
      expect(migration).toContain("provenance backfill aborted");
    });

    it("backfill warns but does not overwrite next_sequence inconsistencies", () => {
      expect(migration).toContain("raise warning");
      expect(migration).toContain("provenance counter inconsistency");
      expect(migration).not.toMatch(
        /update public\.provenance_event_counters\s+set next_sequence/,
      );
    });

    it("migration enforces NOT NULL after backfill", () => {
      expect(migration).toContain("alter column event_hash set not null");
      expect(migration).toContain("alter column previous_event_hash set not null");
    });

    it("migration adds hash_version column and stamps it during backfill", () => {
      expect(migration).toContain("hash_version smallint not null default 0");
      expect(migration).toContain("new.hash_version := 0");
      expect(migration).toContain("hash_version = 0");
    });

    it("migration revokes internal hash helpers from API roles", () => {
      expect(migration).toContain(
        "revoke all on function public.provenance_genesis_sentinel() from public, anon, authenticated",
      );
      expect(migration).toContain(
        "revoke all on function public.provenance_lp(text) from public, anon, authenticated",
      );
      expect(migration).toContain(
        "revoke all on function public.provenance_canonical_payload_v0(public.provenance_events) from public, anon, authenticated",
      );
    });

    it("migration verifies chain integrity per account including hash_version", () => {
      expect(migration).toContain("verify_provenance_chain");
      expect(migration).toContain(
        "provenance chain verification failed for account",
      );
      expect(migration).toContain("unsupported hash_version");
    });
  });
});
