/**
 * E-144 Exercised Anchor Proof — Evidence → Provenance Integration Feasibility
 *
 * Purpose:
 *   Prove (or disprove) that a non-finance evidence event can be anchored through
 *   the existing provenance ledger and accepted by the existing chain verifier.
 *   This is the required feasibility proof for E-144. Results are reported as
 *   PASS / FAIL in the E-144 design report.
 *
 * Design spike: commit as reproducible artifact so feasibility is provable by
 * any developer with the local integration harness, not just by code inspection.
 *
 * Scope: CODE-READ + EXERCISED ANCHOR PROOF ONLY.
 *   - Does not wire production flows.
 *   - Does not fix E-032/033/034/035/036/018/025/084.
 *   - Uses a throwaway test account, rolled back via membership cleanup.
 *   - Follows the same pattern as provenanceFinanceCutoverSecurity.test.js.
 *
 * Interpretation:
 *   PASS  — record_provenance_event accepts entity_type='inspection_report',
 *            event_type='inspection_evidence.attached', the insert commits, and
 *            verify_provenance_chain reports is_valid=true over the resulting chain.
 *            Feasibility is proven, not asserted by code-read.
 *
 *   FAIL  — the write path rejected the event (missing counter row,
 *            constraint violation, auth failure, etc.) or the verifier
 *            reported is_valid=false. Report the exact error in Section 9.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;
const createdAccountIds = [];

// Provenance events are append-only — cannot delete accounts with events.
// Follow E-137 pattern: remove memberships, leave orphaned accounts.
async function cleanup() {
  if (!createdAccountIds.length) return;
  const admin = getIntegrationAdminClient();
  await admin.from("account_members").delete().in("account_id", createdAccountIds);
}

describe("E-144 Evidence → Provenance feasibility proof (design spike)", () => {
  if (isIntegrationHarnessConfigured()) {
    afterAll(cleanup);
  }

  /**
   * ANCHOR PROOF 1: Generic non-finance event type accepted.
   *
   * Calls record_provenance_event with:
   *   entity_type = 'inspection_report'
   *   event_type  = 'inspection_evidence.attached'
   *
   * Then runs verify_provenance_chain. Expects is_valid=true.
   *
   * If this passes: the generic write path is reusable as-is for evidence events.
   * If this fails:  report the exact error — finance-specific assumption detected.
   */
  integrationIt("ANCHOR PROOF 1 — generic evidence event anchors and chain stays valid", async () => {
    const admin = getIntegrationAdminClient();
    const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");

    // Create a minimal throwaway account
    const accountId = randomUUID();
    createdAccountIds.push(accountId);
    const propertyId = randomUUID();

    const { error: acctErr } = await admin.from("accounts").insert({
      id: accountId,
      name: `E-144 feasibility probe ${accountId.slice(0, 8)}`,
      created_by: ownerUser.id,
      is_root: false,
      subscription_status: "active",
      subscription_plan: "pro",
    });
    expect(acctErr, `account insert: ${acctErr?.message}`).toBeNull();

    const { error: memberErr } = await admin.from("account_members").insert({
      account_id: accountId,
      user_id: ownerUser.id,
      role: "owner",
    });
    expect(memberErr, `member insert: ${memberErr?.message}`).toBeNull();

    // Synthetic entity IDs — no real rows needed. The provenance ledger only
    // requires entity_id to be a UUID; it does not foreign-key it.
    const inspectionReportId = randomUUID();
    const photoId = randomUUID();

    // --- WRITE: anchor the evidence event ---
    const { data: eventId, error: writeErr } = await ownerClient.rpc(
      "record_provenance_event",
      {
        p_account_id:   accountId,
        p_entity_type:  "inspection_report",
        p_entity_id:    inspectionReportId,
        p_event_type:   "inspection_evidence.attached",
        p_actor_type:   "human",
        p_occurred_at:  new Date().toISOString(),
        p_summary:      "E-144 design spike: inspection photo attached to check-in report",
        p_property_id:  propertyId,
        p_tenancy_id:   null,
        p_reason:       null,
        p_metadata:     {
          // Canonical payload shape proposed in E-144 design
          entity_version_id: inspectionReportId,
          source_row_type:   "inspection_evidence_items",
          source_row_id:     photoId,
          document_version_id: null,
          document_family_id:  null,
          content_hash:        null, // no hash yet — this is what E-144 adds
          attester_role:       "landlord",
          spike_note:          "E-144 feasibility probe — safe to ignore",
        },
        p_source_type:  null,
        p_source_id:    inspectionReportId,
        p_idempotency_key: `e144-spike:inspection_evidence.attached:${photoId}`,
        p_visibility:   "internal",
      },
    );

    expect(writeErr, `ANCHOR PROOF 1 WRITE FAILED: ${writeErr?.message}`).toBeNull();
    expect(eventId).toBeTruthy();

    // --- VERIFY: chain must accept the non-finance event ---
    const { data: chainResult, error: verifyErr } = await ownerClient.rpc(
      "verify_provenance_chain",
      { p_account_id: accountId },
    );

    expect(verifyErr, `ANCHOR PROOF 1 VERIFY FAILED: ${verifyErr?.message}`).toBeNull();

    // The key assertion: non-finance event does not break chain integrity
    expect(
      chainResult?.is_valid,
      `ANCHOR PROOF 1: chain is_valid=false — reason: ${chainResult?.first_broken_reason}`,
    ).toBe(true);

    expect(chainResult?.checked_count).toBeGreaterThanOrEqual(1);
  });

  /**
   * ANCHOR PROOF 2: Idempotency on repeated call with same key.
   *
   * Verifies that re-submitting the same evidence event returns the existing
   * event without creating a duplicate, and chain remains valid.
   */
  integrationIt("ANCHOR PROOF 2 — idempotency key prevents duplicate anchor", async () => {
    const admin = getIntegrationAdminClient();
    const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");

    const accountId = randomUUID();
    createdAccountIds.push(accountId);

    await admin.from("accounts").insert({
      id: accountId,
      name: `E-144 idempotency probe ${accountId.slice(0, 8)}`,
      created_by: ownerUser.id,
      is_root: false,
      subscription_status: "active",
      subscription_plan: "pro",
    });
    await admin.from("account_members").insert({
      account_id: accountId,
      user_id: ownerUser.id,
      role: "owner",
    });

    const inspectionReportId = randomUUID();
    const idempotencyKey = `e144-spike:inspection_report.locked:${inspectionReportId}`;

    const payload = {
      p_account_id:      accountId,
      p_entity_type:     "inspection_report",
      p_entity_id:       inspectionReportId,
      p_event_type:      "inspection_report.locked",
      p_actor_type:      "human",
      p_occurred_at:     new Date().toISOString(),
      p_summary:         "E-144 idempotency probe: inspection report locked",
      p_metadata:        { spike_note: "E-144 idempotency probe" },
      p_idempotency_key: idempotencyKey,
    };

    const { data: first, error: err1 } = await ownerClient.rpc("record_provenance_event", payload);
    expect(err1, `first call: ${err1?.message}`).toBeNull();

    const { data: second, error: err2 } = await ownerClient.rpc("record_provenance_event", payload);
    expect(err2, `second call: ${err2?.message}`).toBeNull();

    // Same event returned — no duplicate
    expect(second?.id ?? second).toEqual(first?.id ?? first);

    const { data: chainResult } = await ownerClient.rpc("verify_provenance_chain", {
      p_account_id: accountId,
    });
    expect(chainResult?.is_valid).toBe(true);
    // Only one event created despite two calls
    expect(chainResult?.checked_count).toBe(1);
  });

  /**
   * ANCHOR PROOF 3: metadata field carries document hash safely.
   *
   * Verifies that a SHA-256 content hash stored in the metadata jsonb field
   * is preserved in the canonical payload and does not break chain integrity.
   * This is the proposed mechanism for E-032/E-033 content binding.
   */
  integrationIt("ANCHOR PROOF 3 — content_hash in metadata is preserved and chain stays valid", async () => {
    const admin = getIntegrationAdminClient();
    const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");

    const accountId = randomUUID();
    createdAccountIds.push(accountId);

    await admin.from("accounts").insert({
      id: accountId,
      name: `E-144 hash probe ${accountId.slice(0, 8)}`,
      created_by: ownerUser.id,
      is_root: false,
      subscription_status: "active",
      subscription_plan: "pro",
    });
    await admin.from("account_members").insert({
      account_id: accountId,
      user_id: ownerUser.id,
      role: "owner",
    });

    const reportId = randomUUID();
    const fakeContentHash = "a".repeat(64); // synthetic SHA-256 hex

    const { error: writeErr } = await ownerClient.rpc("record_provenance_event", {
      p_account_id:  accountId,
      p_entity_type: "inspection_report",
      p_entity_id:   reportId,
      p_event_type:  "signature.captured",
      p_actor_type:  "human",
      p_occurred_at: new Date().toISOString(),
      p_summary:     "E-144 hash probe: tenant signature captured",
      p_metadata:    {
        signer_role:         "tenant",
        signed_from:         "tenant_portal",
        report_content_hash: fakeContentHash,  // this is what E-033 fix adds
        share_id:            randomUUID(),
        spike_note:          "E-144 content hash probe",
      },
    });

    expect(writeErr, `hash probe write: ${writeErr?.message}`).toBeNull();

    // Retrieve the event and verify hash is in metadata
    const { data: events } = await ownerClient
      .from("provenance_events")
      .select("event_type, metadata, event_hash")
      .eq("account_id", accountId)
      .eq("entity_type", "inspection_report")
      .eq("entity_id", reportId);

    expect(events).toHaveLength(1);
    expect(events[0].metadata.report_content_hash).toBe(fakeContentHash);
    expect(events[0].event_hash).toMatch(/^[0-9a-f]{64}$/);

    const { data: chain } = await ownerClient.rpc("verify_provenance_chain", {
      p_account_id: accountId,
    });
    expect(chain?.is_valid).toBe(true);
  });
});
