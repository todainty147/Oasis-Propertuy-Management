/**
 * Phase A-2.2 — Inspection Report Lock + Signature Binding Contracts
 *
 * 8 tests covering all mandatory requirements:
 *
 * 1. Lock atomicity deny-test: provenance failure rolls back status='locked' UPDATE.
 * 2. Signature atomicity deny-test: provenance failure rolls back the signature INSERT.
 * 3. Lock binding correctness: event.metadata.content_hash == pre-lock state hash.
 * 4. Signature binding correctness: event.metadata.content_hash == pre-insert state hash;
 *    hash_timing='pre_signature_insert'; signature_count = 0 (first signature).
 * 5. Mutation-after-signature blocked at status='signed' (the exact finding gap).
 * 6. Non-circular hash timing: pre-lock hash == event hash;
 *    post-lock hash ≠ pre-lock hash (status changed to 'locked').
 * 7. Lock idempotency: locking same report twice yields exactly one provenance event.
 * 8. Bypass detection: direct UPDATE to status='locked' blocked by trg_enforce_lock_via_rpc.
 *
 * Tests run on a script-built DB (E-149 replay guard must stay green).
 * Tests 5 and 8 use admin client (service_role) to bypass RLS while hitting triggers.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;
const createdAccountIds = [];

async function cleanup() {
  if (!createdAccountIds.length) return;
  const admin = getIntegrationAdminClient();
  await admin.from("account_members").delete().in("account_id", createdAccountIds);
}

/**
 * Creates minimal test scaffold: account + owner membership + inspection report.
 * opts.withItems: also creates a room and an evidence item (needed for meaningful hashes).
 * opts.status: report status (default 'ready_for_signature').
 * Returns { accountId, reportId, roomId?, itemId? }.
 */
async function scaffoldReport(admin, ownerUser, opts = {}) {
  const accountId = randomUUID();
  createdAccountIds.push(accountId);

  const { error: acctErr } = await admin.from("accounts").insert({
    id: accountId,
    name: `A-2.2 probe ${accountId.slice(0, 8)}`,
    created_by: ownerUser.id,
    is_root: false,
    subscription_status: "active",
    subscription_plan: "pro",
  });
  if (acctErr) throw new Error(`account insert: ${acctErr.message}`);

  const { error: memberErr } = await admin.from("account_members").insert({
    account_id: accountId,
    user_id: ownerUser.id,
    role: "owner",
  });
  if (memberErr) throw new Error(`member insert: ${memberErr.message}`);

  const reportId = randomUUID();
  const { error: reportErr } = await admin.from("inspection_reports").insert({
    id: reportId,
    account_id: accountId,
    inspection_type: "check_in",
    status: opts.status ?? "ready_for_signature",
    title: "A-2.2 test report",
    inspection_date: "2026-07-01",
  });
  if (reportErr) throw new Error(`report insert: ${reportErr.message}`);

  if (opts.withItems) {
    const roomId = randomUUID();
    const { error: roomErr } = await admin.from("inspection_rooms").insert({
      id: roomId,
      account_id: accountId,
      inspection_report_id: reportId,
      room_name: "Living Room",
      sort_order: 0,
    });
    if (roomErr) throw new Error(`room insert: ${roomErr.message}`);

    const itemId = randomUUID();
    const { error: itemErr } = await admin.from("inspection_evidence_items").insert({
      id: itemId,
      account_id: accountId,
      inspection_room_id: roomId,
      item_label: "Carpet",
      condition_rating: "good",
      notes: "Original notes",
      sort_order: 0,
    });
    if (itemErr) throw new Error(`item insert: ${itemErr.message}`);

    return { accountId, reportId, roomId, itemId };
  }

  return { accountId, reportId };
}

describe("Phase A-2.2 — inspection report lock + signature binding contracts", () => {
  if (isIntegrationHarnessConfigured()) {
    afterAll(cleanup);
  }

  // ─── Test 1: Lock atomicity deny-test ───────────────────────────────────────
  integrationIt(
    "1 atomicity deny-test: lock UPDATE rolls back when provenance event fails",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      const { error: denyErr } = await ownerClient.rpc("inspect_lock_deny_test", {
        p_account_id: accountId,
        p_report_id: reportId,
      });

      expect(denyErr, "deny-test must return an error").not.toBeNull();
      expect(denyErr.message).toMatch(/summary is required/i);

      const { data: report, error: readErr } = await admin
        .from("inspection_reports")
        .select("status")
        .eq("id", reportId)
        .single();

      expect(readErr, `report read: ${readErr?.message}`).toBeNull();
      expect(report.status, "UPDATE must have rolled back — status must not be 'locked'").not.toBe(
        "locked",
      );
    },
  );

  // ─── Test 2: Signature atomicity deny-test ──────────────────────────────────
  integrationIt(
    "2 atomicity deny-test: signature INSERT rolls back when provenance event fails",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      const { error: denyErr } = await ownerClient.rpc("inspect_sig_deny_test", {
        p_account_id: accountId,
        p_report_id: reportId,
      });

      expect(denyErr, "deny-test must return an error").not.toBeNull();
      expect(denyErr.message).toMatch(/summary is required/i);

      const { data: sigs, error: sigsErr } = await admin
        .from("inspection_signatures")
        .select("id")
        .eq("inspection_report_id", reportId);

      expect(sigsErr, `sigs read: ${sigsErr?.message}`).toBeNull();
      expect(sigs, "INSERT must have rolled back — no signature should persist").toHaveLength(0);
    },
  );

  // ─── Test 3: Lock binding correctness ───────────────────────────────────────
  integrationIt(
    "3 binding correctness: lock event content_hash matches pre-lock report state",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser, { withItems: true });

      // Capture pre-lock hash — must match what the RPC stores in the event
      const { data: preLockHash, error: hashErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(hashErr, `pre-lock hash: ${hashErr?.message}`).toBeNull();
      expect(preLockHash).toBeTruthy();

      const { data: lockResult, error: lockErr } = await ownerClient.rpc(
        "lock_inspection_report",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(lockErr, `lock_inspection_report: ${lockErr?.message}`).toBeNull();
      expect(lockResult?.event_id).toBeTruthy();

      // RPC return value must carry the same hash
      expect(lockResult.content_hash, "RPC content_hash must match pre-lock hash").toBe(
        preLockHash,
      );

      // Provenance event metadata must carry the same hash
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id, event_type, metadata")
        .eq("account_id", accountId)
        .eq("entity_type", "inspection_report")
        .eq("entity_id", reportId)
        .eq("event_type", "inspection_report.locked");

      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(lockResult.event_id);
      expect(events[0].metadata?.content_hash).toBe(preLockHash);
      expect(events[0].metadata?.hash_algorithm).toBe("sha256");
      expect(events[0].metadata?.signature_count).toBe(0);
      expect(events[0].metadata?.hash_note).toMatch(/includes all signatures/i);
    },
  );

  // ─── Test 4: Signature binding correctness ───────────────────────────────────
  integrationIt(
    "4 binding correctness: signature event hash matches pre-insert state; hash_timing='pre_signature_insert'",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser, { withItems: true });

      // Hash BEFORE signature capture — this is the state the signer observed
      const { data: preCapHash, error: hashErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(hashErr, `pre-capture hash: ${hashErr?.message}`).toBeNull();
      expect(preCapHash).toBeTruthy();

      const { data: sigResult, error: sigErr } = await ownerClient.rpc(
        "capture_inspection_signature",
        {
          p_account_id: accountId,
          p_report_id: reportId,
          p_signer_role: "landlord",
          p_signed_from: "landlord_portal",
          p_signature_data: "data:image/png;base64,fakesig",
          p_signer_name: "Test Landlord",
        },
      );
      expect(sigErr, `capture_inspection_signature: ${sigErr?.message}`).toBeNull();
      expect(sigResult?.event_id).toBeTruthy();
      expect(sigResult?.signature_id).toBeTruthy();

      // RPC return value must carry the pre-insert hash
      expect(sigResult.content_hash, "RPC content_hash must match pre-insert hash").toBe(
        preCapHash,
      );

      // Provenance event metadata must carry the same hash with correct annotations
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id, event_type, metadata")
        .eq("account_id", accountId)
        .eq("entity_type", "inspection_signature")
        .eq("entity_id", sigResult.signature_id)
        .eq("event_type", "signature.captured");

      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0].metadata?.report_content_hash).toBe(preCapHash);
      expect(events[0].metadata?.hash_timing).toBe("pre_signature_insert");
      expect(events[0].metadata?.signature_count).toBe(0);
      expect(events[0].metadata?.hash_note).toMatch(/excludes the signature being captured/i);
    },
  );

  // ─── Test 5: Mutation-after-signature blocked at 'signed' ───────────────────
  integrationIt(
    "5 mutation gap: item edits blocked at status='signed', not only at 'locked'",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId, itemId } = await scaffoldReport(admin, ownerUser, {
        withItems: true,
      });

      // Capture a signature — transitions report status to 'signed'
      const { error: sigErr } = await ownerClient.rpc("capture_inspection_signature", {
        p_account_id: accountId,
        p_report_id: reportId,
        p_signer_role: "landlord",
        p_signed_from: "landlord_portal",
        p_signature_data: null,
        p_signer_name: "Test Landlord",
      });
      expect(sigErr, `capture_inspection_signature: ${sigErr?.message}`).toBeNull();

      // Verify report is now 'signed' (not 'locked')
      const { data: reportRow } = await admin
        .from("inspection_reports")
        .select("status")
        .eq("id", reportId)
        .single();
      expect(reportRow.status, "report must be 'signed' after capture").toBe("signed");

      // Attempt item mutation via admin client — bypasses RLS, hits trigger
      const { error: mutErr } = await admin
        .from("inspection_evidence_items")
        .update({ notes: "mutated after signing" })
        .eq("id", itemId);

      expect(mutErr, "mutation at 'signed' status must be blocked by trigger").not.toBeNull();
      expect(mutErr.message).toMatch(/signed.*locked.*archived.*cannot be edited/i);

      // Notes must be unchanged
      const { data: item } = await admin
        .from("inspection_evidence_items")
        .select("notes")
        .eq("id", itemId)
        .single();
      expect(item.notes, "notes must be unchanged after blocked mutation").toBe("Original notes");
    },
  );

  // ─── Test 6: Non-circular hash timing proof (re-grounded for E-152) ──────────
  // E-152 removed status from the canonical hash.  Pre-lock and post-lock
  // content hashes are now IDENTICAL (same document content, no status delta).
  // The lock is proven via locked_at / locked_by column values and the
  // workflow_status_at_lock field in the provenance event metadata — not by
  // a hash change.  The event hash still proves the content was captured
  // BEFORE the UPDATE (matches independently recomputed hash for same state).
  integrationIt(
    "6 re-grounded timing (E-152): event hash == pre-lock content hash; lock proven via locked_at/locked_by + metadata",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser, { withItems: true });

      // Capture a signature first so the hash includes a signature entry.
      await ownerClient.rpc("capture_inspection_signature", {
        p_account_id: accountId,
        p_report_id: reportId,
        p_signer_name: "Signing Landlord",
      });

      // Pre-lock content hash (status excluded — E-152).
      const { data: preLockHash, error: preErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(preErr, `pre-lock hash: ${preErr?.message}`).toBeNull();
      expect(preLockHash).toBeTruthy();

      // Lock the report.
      const { data: lockResult, error: lockErr } = await ownerClient.rpc(
        "lock_inspection_report",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(lockErr, `lock: ${lockErr?.message}`).toBeNull();

      // Post-lock content hash — identical to pre-lock because status is not
      // part of the canonical hash (E-152).  This is expected and correct.
      const { data: postLockHash, error: postErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(postErr, `post-lock hash: ${postErr?.message}`).toBeNull();

      // Event hash must equal pre-lock hash — proves it was computed before the UPDATE.
      expect(
        lockResult.content_hash,
        "event hash must match pre-lock content hash — proves hash was computed before the status UPDATE",
      ).toBe(preLockHash);

      // E-152: Pre-lock and post-lock hashes are now identical (status excluded).
      // Do NOT assert they differ — that would require re-adding status to the hash.
      expect(
        postLockHash,
        "post-lock content hash must equal pre-lock hash (E-152: status excluded from hash)",
      ).toBe(preLockHash);

      // Lock is proven by database column values, not by hash change.
      const { data: lockedReport, error: lockedReadErr } = await admin
        .from("inspection_reports")
        .select("status, locked_at, locked_by")
        .eq("id", reportId)
        .single();
      expect(lockedReadErr, `locked report read: ${lockedReadErr?.message}`).toBeNull();
      expect(lockedReport.status, "status must be 'locked'").toBe("locked");
      expect(lockedReport.locked_at, "locked_at must be set").toBeTruthy();
      expect(lockedReport.locked_by, "locked_by must be set to the locking user").toBeTruthy();

      // Provenance event metadata must carry workflow_status_at_lock (pre-lock status).
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id, metadata")
        .eq("account_id", accountId)
        .eq("entity_type", "inspection_report")
        .eq("entity_id", reportId)
        .eq("event_type", "inspection_report.locked");
      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0].metadata?.content_hash, "event must carry the pre-lock content hash").toBe(preLockHash);
      expect(events[0].metadata?.workflow_status_at_lock, "event must record pre-lock status in metadata").toBe("signed");
      expect(events[0].metadata?.hash_note, "hash_note must document E-152 exclusion").toMatch(/E-152/);
    },
  );

  // ─── Test 7: Lock idempotency ────────────────────────────────────────────────
  integrationIt(
    "7 idempotency: locking same report twice errors and leaves exactly one provenance event",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      const { data: firstLock, error: firstErr } = await ownerClient.rpc(
        "lock_inspection_report",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(firstErr, `first lock: ${firstErr?.message}`).toBeNull();
      expect(firstLock?.event_id).toBeTruthy();

      // Second attempt must fail — report is already locked
      const { error: secondErr } = await ownerClient.rpc("lock_inspection_report", {
        p_account_id: accountId,
        p_report_id: reportId,
      });
      expect(secondErr, "second lock call must return an error").not.toBeNull();
      expect(secondErr.message).toMatch(/already locked/i);

      // Exactly one lock event in the provenance ledger — no duplicate
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id")
        .eq("account_id", accountId)
        .eq("event_type", "inspection_report.locked")
        .eq("entity_id", reportId);

      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events, "exactly one lock event must exist").toHaveLength(1);
      expect(events[0].id, "event id must match the first lock call").toBe(firstLock.event_id);
    },
  );

  // ─── Test 8: Bypass detection ────────────────────────────────────────────────
  integrationIt(
    "8 bypass detection: direct UPDATE to status='locked' blocked by trg_enforce_lock_via_rpc",
    async () => {
      const admin = getIntegrationAdminClient();
      const { user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      // Admin client (service_role) bypasses RLS but NOT triggers
      const { error: bypassErr } = await admin
        .from("inspection_reports")
        .update({ status: "locked" })
        .eq("id", reportId);

      expect(bypassErr, "trigger must block the direct status='locked' update").not.toBeNull();
      expect(bypassErr.message).toMatch(/via lock_inspection_report/i);

      // Status must be unchanged
      const { data: report, error: readErr } = await admin
        .from("inspection_reports")
        .select("status")
        .eq("id", reportId)
        .single();

      expect(readErr, `report read: ${readErr?.message}`).toBeNull();
      expect(report.status, "status must remain unchanged after blocked bypass").not.toBe("locked");
    },
  );
});
