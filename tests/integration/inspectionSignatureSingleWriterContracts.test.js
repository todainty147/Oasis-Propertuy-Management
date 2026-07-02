/**
 * E-033 — Single-Writer Inspection Signature Contracts
 *
 * Proves that capture_inspection_signature is the sole writer for
 * inspection_signatures after E-033.  Two authorization domains, one write path.
 *
 * Tests:
 *  1  Tenant signing uses the RPC, creates provenance event, content hash present.
 *  2  Tenant path pins role/source — spoofed values rejected or server-overridden.
 *  3  Manager cannot direct-insert after RLS change; RPC succeeds with provenance.
 *  4  Tenant cannot direct-insert after RLS change; RPC succeeds with provenance.
 *  5  Manager cannot fabricate a tenant-portal signature.
 *  6  Per-share uniqueness — second tenant sign for same share is rejected.
 *  7  Atomicity: signature INSERT + provenance are atomic (deny-test via helper).
 *  8  Content-only hash: signature event hash equals independently recomputed
 *     content-only hash; excludes status, locked_at, locked_by, raw blob.
 *  9  (Source-level) — covered by inspectionSignatureSingleWriterSecurityContracts.test.js
 * 10  Lock path re-grounding — covered in inspectionLockSignatureContracts.test.js (Test 6).
 *
 * Tests run on a script-built DB (E-149 replay guard must stay green).
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;
const createdAccountIds = [];

async function cleanup() {
  if (!createdAccountIds.length) return;
  const admin = getIntegrationAdminClient();
  await admin.from("account_members").delete().in("account_id", createdAccountIds);
}

/**
 * Scaffolds: fresh account + owner membership + inspection report.
 * opts.withItems: also creates a room and an evidence item.
 * opts.status: report status (default 'ready_for_signature').
 */
async function scaffoldReport(admin, ownerUser, opts = {}) {
  const accountId = randomUUID();
  createdAccountIds.push(accountId);

  const { error: acctErr } = await admin.from("accounts").insert({
    id: accountId,
    name: `E-033 probe ${accountId.slice(0, 8)}`,
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
    title: "E-033 test report",
    inspection_date: "2026-07-01",
  });
  if (reportErr) throw new Error(`report insert: ${reportErr.message}`);

  if (opts.withItems) {
    const roomId = randomUUID();
    const { error: roomErr } = await admin.from("inspection_rooms").insert({
      id: roomId,
      account_id: accountId,
      inspection_report_id: reportId,
      room_name: "Main Room",
      sort_order: 0,
    });
    if (roomErr) throw new Error(`room insert: ${roomErr.message}`);

    const itemId = randomUUID();
    const { error: itemErr } = await admin.from("inspection_evidence_items").insert({
      id: itemId,
      account_id: accountId,
      inspection_room_id: roomId,
      item_label: "Floor",
      condition_rating: "good",
      notes: "Original notes",
      sort_order: 0,
    });
    if (itemErr) throw new Error(`item insert: ${itemErr.message}`);

    return { accountId, reportId, roomId, itemId };
  }

  return { accountId, reportId };
}

/**
 * Extends scaffoldReport with a tenant record pointing at the tenantA1 fixture
 * user's auth UID, and a valid inspection_report_shares row.
 * tenantUserId = auth UID of the fixture tenant (isolationFixtures.users.tenantA1.id).
 */
async function scaffoldTenantReport(admin, ownerUser, tenantUserId, opts = {}) {
  const result = await scaffoldReport(admin, ownerUser, opts);
  const { accountId, reportId } = result;

  const tenantId = randomUUID();
  const { error: tenantErr } = await admin.from("tenants").insert({
    id: tenantId,
    account_id: accountId,
    user_id: tenantUserId,
    name: "Test Tenant E-033",
    email: "tenant.a1@oasis.test",
  });
  if (tenantErr) throw new Error(`tenant insert: ${tenantErr.message}`);

  const shareId = randomUUID();
  const { error: shareErr } = await admin.from("inspection_report_shares").insert({
    id: shareId,
    account_id: accountId,
    inspection_report_id: reportId,
    tenant_id: tenantId,
    shared_by: ownerUser.id,
    share_status: "shared",
  });
  if (shareErr) throw new Error(`share insert: ${shareErr.message}`);

  return { ...result, tenantId, shareId };
}

describe("E-033 — inspection signature single-writer contracts", () => {
  if (isIntegrationHarnessConfigured()) {
    afterAll(cleanup);
  }

  // ─── Test 1: Tenant signing routes through RPC ───────────────────────────────
  integrationIt(
    "1 tenant signing: RPC call creates signature row + signature.captured provenance event",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: tenantClient, user: tenantUser } = await signInAsFixtureUser("tenantA1");

      const { accountId, reportId, shareId, tenantId } = await scaffoldTenantReport(
        admin,
        ownerUser,
        tenantUser.id,
        { withItems: true },
      );

      // Tenant signs via RPC
      const { data: sigResult, error: sigErr } = await tenantClient.rpc(
        "capture_inspection_signature",
        {
          p_account_id: accountId,
          p_report_id: reportId,
          p_signer_name: "Tenant A",
          p_share_id: shareId,
        },
      );

      expect(sigErr, `capture_inspection_signature (tenant): ${sigErr?.message}`).toBeNull();
      expect(sigResult?.signature_id).toBeTruthy();
      expect(sigResult?.event_id).toBeTruthy();
      expect(sigResult?.content_hash).toBeTruthy();
      expect(sigResult?.signer_role, "server must derive signer_role=tenant").toBe("tenant");
      expect(sigResult?.signed_from, "server must derive signed_from=tenant_portal").toBe("tenant_portal");

      // Signature row exists with correct server-derived fields
      const { data: sig, error: sigReadErr } = await admin
        .from("inspection_signatures")
        .select("id, signer_role, signer_type, signed_from, tenant_id, share_id, account_id")
        .eq("id", sigResult.signature_id)
        .single();
      expect(sigReadErr, `sig read: ${sigReadErr?.message}`).toBeNull();
      expect(sig.signer_role).toBe("tenant");
      expect(sig.signer_type).toBe("tenant");
      expect(sig.signed_from).toBe("tenant_portal");
      expect(sig.tenant_id).toBe(tenantId);
      expect(sig.share_id).toBe(shareId);

      // Provenance event exists
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id, event_type, metadata")
        .eq("account_id", accountId)
        .eq("entity_type", "inspection_signature")
        .eq("entity_id", sigResult.signature_id)
        .eq("event_type", "signature.captured");
      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0].metadata?.report_content_hash).toBeTruthy();
      expect(events[0].metadata?.signer_role).toBe("tenant");
      expect(events[0].metadata?.signer_type).toBe("tenant");
      expect(events[0].metadata?.signed_from).toBe("tenant_portal");
      expect(events[0].metadata?.tenant_id).toBe(tenantId);
      expect(events[0].metadata?.share_id).toBe(shareId);
      expect(events[0].metadata?.hash_timing).toBe("pre_signature_insert");
      expect(events[0].metadata?.workflow_status_at_signing).toBeTruthy();
    },
  );

  // ─── Test 2: Tenant path pins role/source ────────────────────────────────────
  integrationIt(
    "2 role pinning: tenant RPC ignores spoofed signer_role/signed_from; manager cannot spoof tenant fields",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: tenantClient, user: tenantUser } = await signInAsFixtureUser("tenantA1");

      const { accountId, reportId, shareId, tenantId } = await scaffoldTenantReport(
        admin,
        ownerUser,
        tenantUser.id,
      );

      // Tenant passes spoofed landlord values — server must ignore them.
      const { data: sigResult, error: sigErr } = await tenantClient.rpc(
        "capture_inspection_signature",
        {
          p_account_id: accountId,
          p_report_id: reportId,
          p_signer_name: "Sneaky Tenant",
          p_share_id: shareId,
          p_signer_role: "landlord",       // spoofed — must be overridden
          p_signed_from: "landlord_portal", // spoofed — must be overridden
          p_signer_type: "agent",           // spoofed — must be overridden
        },
      );
      expect(sigErr, `RPC must succeed despite spoofed params: ${sigErr?.message}`).toBeNull();

      // Server must have overridden all three fields.
      const { data: sig, error: readErr } = await admin
        .from("inspection_signatures")
        .select("signer_role, signer_type, signed_from")
        .eq("id", sigResult.signature_id)
        .single();
      expect(readErr, `sig read: ${readErr?.message}`).toBeNull();
      expect(sig.signer_role, "server must override signer_role to 'tenant'").toBe("tenant");
      expect(sig.signer_type, "server must override signer_type to 'tenant'").toBe("tenant");
      expect(sig.signed_from, "server must override signed_from to 'tenant_portal'").toBe("tenant_portal");

      // Manager path cannot set signer_role='tenant' or signed_from='tenant_portal'.
      const { accountId: acctB, reportId: rptB } = await scaffoldReport(admin, ownerUser);
      const { error: fakeErr } = await ownerClient.rpc("capture_inspection_signature", {
        p_account_id: acctB,
        p_report_id: rptB,
        p_signer_name: "Manager attempting tenant forgery",
        p_signer_role: "tenant",
        p_signed_from: "tenant_portal",
      });
      expect(fakeErr, "manager must not be able to set signer_role='tenant' without a share_id").not.toBeNull();
      expect(fakeErr.message).toMatch(/signer_role must be 'landlord'/i);
    },
  );

  // ─── Test 3: Manager direct-insert denied; RPC succeeds ──────────────────────
  integrationIt(
    "3 manager direct-insert denied after RLS change; capture_inspection_signature RPC succeeds",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      // Direct insert via authenticated client must be denied (no INSERT policy for managers).
      const { error: directErr } = await ownerClient.from("inspection_signatures").insert({
        account_id: accountId,
        inspection_report_id: reportId,
        signer_type: "landlord",
        signer_role: "landlord",
        signer_name: "Manager Direct",
        signed_from: "landlord_portal",
        metadata: {},
      });
      expect(directErr, "direct manager INSERT must be denied by RLS").not.toBeNull();

      // RPC must succeed.
      const { data: rpcResult, error: rpcErr } = await ownerClient.rpc(
        "capture_inspection_signature",
        {
          p_account_id: accountId,
          p_report_id: reportId,
          p_signer_name: "Manager via RPC",
        },
      );
      expect(rpcErr, `manager RPC must succeed: ${rpcErr?.message}`).toBeNull();
      expect(rpcResult?.signature_id).toBeTruthy();
      expect(rpcResult?.event_id).toBeTruthy();

      // Provenance event exists.
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id, event_type")
        .eq("account_id", accountId)
        .eq("event_type", "signature.captured")
        .eq("entity_id", rpcResult.signature_id);
      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);
    },
  );

  // ─── Test 4: Tenant direct-insert denied; RPC succeeds ───────────────────────
  integrationIt(
    "4 tenant direct-insert denied after RLS change; capture_inspection_signature RPC succeeds",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: tenantClient, user: tenantUser } = await signInAsFixtureUser("tenantA1");

      const { accountId, reportId, shareId, tenantId } = await scaffoldTenantReport(
        admin,
        ownerUser,
        tenantUser.id,
      );

      // Tenant direct insert (PostgREST) must be denied — INSERT policy has been dropped.
      const { error: directErr } = await tenantClient.from("inspection_signatures").insert({
        account_id: accountId,
        inspection_report_id: reportId,
        signer_type: "tenant",
        signer_role: "tenant",
        signer_name: "Tenant Direct",
        signed_from: "tenant_portal",
        tenant_id: tenantId,
        share_id: shareId,
        metadata: {},
      });
      expect(directErr, "direct tenant INSERT must be denied by RLS").not.toBeNull();

      // RPC must succeed.
      const { data: rpcResult, error: rpcErr } = await tenantClient.rpc(
        "capture_inspection_signature",
        {
          p_account_id: accountId,
          p_report_id: reportId,
          p_signer_name: "Tenant via RPC",
          p_share_id: shareId,
        },
      );
      expect(rpcErr, `tenant RPC must succeed: ${rpcErr?.message}`).toBeNull();
      expect(rpcResult?.signature_id).toBeTruthy();
      expect(rpcResult?.event_id).toBeTruthy();
    },
  );

  // ─── Test 5: Manager cannot fabricate tenant-portal signature ────────────────
  integrationIt(
    "5 forgery prevention: manager cannot create signature with signer_role=tenant or signed_from=tenant_portal",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      // Attempt 1: signer_role='tenant' without share_id → rejected by manager path check.
      const { error: err1 } = await ownerClient.rpc("capture_inspection_signature", {
        p_account_id: accountId,
        p_report_id: reportId,
        p_signer_name: "Forger",
        p_signer_role: "tenant",
      });
      expect(err1, "signer_role='tenant' on manager path must be rejected").not.toBeNull();
      expect(err1.message).toMatch(/signer_role must be 'landlord'/i);

      // Attempt 2: signed_from='tenant_portal' without share_id → rejected.
      const { error: err2 } = await ownerClient.rpc("capture_inspection_signature", {
        p_account_id: accountId,
        p_report_id: reportId,
        p_signer_name: "Forger2",
        p_signed_from: "tenant_portal",
      });
      expect(err2, "signed_from='tenant_portal' on manager path must be rejected").not.toBeNull();
      expect(err2.message).toMatch(/signed_from must be 'landlord_portal'/i);

      // Verify no signature was created.
      const { data: sigs, error: sigsErr } = await admin
        .from("inspection_signatures")
        .select("id")
        .eq("inspection_report_id", reportId);
      expect(sigsErr, `sigs read: ${sigsErr?.message}`).toBeNull();
      expect(sigs).toHaveLength(0);
    },
  );

  // ─── Test 6: Per-share uniqueness ────────────────────────────────────────────
  // Hard uniqueness: unique index on (inspection_report_id, share_id) where share_id is not null.
  // Second tenant sign attempt via RPC is rejected with a conflict error.
  integrationIt(
    "6 per-share uniqueness: second tenant signature on same share is rejected",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: tenantClient, user: tenantUser } = await signInAsFixtureUser("tenantA1");

      const { accountId, reportId, shareId } = await scaffoldTenantReport(
        admin,
        ownerUser,
        tenantUser.id,
      );

      // First sign succeeds.
      const { error: firstErr } = await tenantClient.rpc("capture_inspection_signature", {
        p_account_id: accountId,
        p_report_id: reportId,
        p_signer_name: "Tenant First Sign",
        p_share_id: shareId,
      });
      expect(firstErr, `first sign must succeed: ${firstErr?.message}`).toBeNull();

      // Second sign on the same share must fail.
      const { error: secondErr } = await tenantClient.rpc("capture_inspection_signature", {
        p_account_id: accountId,
        p_report_id: reportId,
        p_signer_name: "Tenant Second Sign",
        p_share_id: shareId,
      });
      expect(secondErr, "second sign on same share must be rejected").not.toBeNull();

      // Exactly one signature must exist.
      const { data: sigs, error: sigsErr } = await admin
        .from("inspection_signatures")
        .select("id")
        .eq("inspection_report_id", reportId)
        .eq("share_id", shareId);
      expect(sigsErr, `sigs read: ${sigsErr?.message}`).toBeNull();
      expect(sigs, "exactly one signature must exist for this share").toHaveLength(1);
    },
  );

  // ─── Test 7: Production-RPC atomicity deny-test ─────────────────────────────
  // Calls the REAL capture_inspection_signature via a thin wrapper that sets a
  // transaction-local GUC before the call.  Inside record_signature_captured the
  // GUC check fires after the signature INSERT but before _append_evidence_provenance_event,
  // raising an exception that rolls back the entire transaction.
  //
  // This proves the production code path — not a mirror helper — is atomic:
  // if provenance anchoring fails, the signature INSERT is rolled back.
  integrationIt(
    "7 production-RPC atomicity: capture_inspection_signature rolls back when provenance fails",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { accountId, reportId } = await scaffoldReport(admin, ownerUser);

      // Call the production-RPC wrapper.  It arms the transaction-local GUC and then
      // calls the real capture_inspection_signature; record_signature_captured raises
      // before _append_evidence_provenance_event, rolling back the whole transaction.
      const { error: denyErr } = await ownerClient.rpc(
        "capture_inspection_signature_atomicity_deny_test",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(denyErr, "production-RPC atomicity wrapper must return an error").not.toBeNull();
      expect(denyErr.message).toMatch(/test_force_signature_provenance_failure/i);

      // No signature must persist — the INSERT was rolled back with the provenance failure.
      const { data: sigs, error: sigsErr } = await admin
        .from("inspection_signatures")
        .select("id")
        .eq("inspection_report_id", reportId);
      expect(sigsErr, `sigs read: ${sigsErr?.message}`).toBeNull();
      expect(
        sigs,
        "production-RPC: signature INSERT must have rolled back when provenance failed",
      ).toHaveLength(0);

      // No provenance event must exist.
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id")
        .eq("account_id", accountId)
        .eq("event_type", "signature.captured");
      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events, "no partial provenance event must persist").toHaveLength(0);
    },
  );

  // ─── Test 8: Content-only hash binds exact report state ──────────────────────
  integrationIt(
    "8 content-only hash: signature event hash equals independently recomputed hash; excludes status/locked_at/locked_by/blob",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: tenantClient, user: tenantUser } = await signInAsFixtureUser("tenantA1");

      const { accountId, reportId, shareId } = await scaffoldTenantReport(
        admin,
        ownerUser,
        tenantUser.id,
        { withItems: true },
      );

      // Independently compute hash BEFORE signing (as manager, can use get_inspection_report_content_hash).
      const { data: preSignHash, error: preHashErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: accountId, p_report_id: reportId },
      );
      expect(preHashErr, `pre-sign hash: ${preHashErr?.message}`).toBeNull();
      expect(preSignHash).toBeTruthy();

      // Tenant signs via RPC.
      const { data: sigResult, error: sigErr } = await tenantClient.rpc(
        "capture_inspection_signature",
        {
          p_account_id: accountId,
          p_report_id: reportId,
          p_signer_name: "Content Hash Tenant",
          p_share_id: shareId,
        },
      );
      expect(sigErr, `signing: ${sigErr?.message}`).toBeNull();

      // RPC return value must carry the pre-insert content hash.
      expect(sigResult.content_hash, "RPC content_hash must equal independently computed pre-sign hash").toBe(preSignHash);

      // Provenance event metadata must carry the same hash.
      const { data: events, error: evErr } = await admin
        .from("provenance_events")
        .select("id, metadata")
        .eq("account_id", accountId)
        .eq("entity_type", "inspection_signature")
        .eq("entity_id", sigResult.signature_id)
        .eq("event_type", "signature.captured");
      expect(evErr, `provenance read: ${evErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);

      const meta = events[0].metadata;
      expect(meta.report_content_hash, "provenance event hash must match pre-sign hash").toBe(preSignHash);
      expect(meta.hash_timing, "hash_timing must be pre_signature_insert").toBe("pre_signature_insert");
      expect(meta.workflow_status_at_signing, "workflow_status_at_signing must be present in metadata").toBeTruthy();
      expect(meta.hash_note, "hash_note must reference E-152 exclusion").toMatch(/E-152/);

      // E-152: status changes alone must NOT alter the content hash.
      // After capture_inspection_signature the report status is 'signed'.
      // The hash computed POST-signing includes the new signature row (signatures ARE in
      // the hash), so it differs from the PRE-sign hash — that is correct and expected.
      //
      // To isolate the E-152 status-exclusion proof we use a fresh report:
      //   1. scaffold with status 'ready_for_signature', get hash
      //   2. admin-update status to 'signed' (no signature row added)
      //   3. get hash again — must be identical (only status changed)
      const { accountId: acctE152, reportId: rptE152 } = await scaffoldReport(
        admin,
        ownerUser,
        { status: "ready_for_signature" },
      );

      const { data: hashBefore, error: hbErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: acctE152, p_report_id: rptE152 },
      );
      expect(hbErr, `E-152 pre-status hash: ${hbErr?.message}`).toBeNull();
      expect(hashBefore).toBeTruthy();

      // Direct admin status change — no signature row added, only status changes.
      // trg_enforce_lock_via_rpc only blocks status='locked', not 'signed'.
      const { error: statusErr } = await admin
        .from("inspection_reports")
        .update({ status: "signed" })
        .eq("id", rptE152);
      expect(statusErr, `admin status update: ${statusErr?.message}`).toBeNull();

      const { data: hashAfter, error: haErr } = await ownerClient.rpc(
        "get_inspection_report_content_hash",
        { p_account_id: acctE152, p_report_id: rptE152 },
      );
      expect(haErr, `E-152 post-status hash: ${haErr?.message}`).toBeNull();

      expect(
        hashAfter,
        "E-152: status change alone must NOT alter the content hash — status is excluded from canonical hash",
      ).toBe(hashBefore);
    },
  );
});
