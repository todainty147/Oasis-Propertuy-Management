/**
 * E-084 Compliance Verification Contracts — Integration Tests
 *
 * Verifies two properties of record_compliance_value_human_verified:
 *
 * 1. HAPPY PATH: calling the RPC on an OCR-sourced compliance item
 *    anchors a compliance_item.value_human_verified event in the provenance
 *    ledger and leaves the chain valid (is_valid=true).
 *
 * 2. ATOMICITY DENY-TEST: when the provenance INSERT fails (forced via
 *    record_compliance_verification_deny_test with empty summary), the
 *    verification UPDATE rolls back — human_verified_at stays null.
 *
 * Scaffold requires real FK chain:
 *   accounts → documents → document_extractions → tenancy_compliance_items
 *
 * Cleanup: remove memberships only. Provenance events are append-only;
 * accounts with provenance events become orphans (E-137 pattern).
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

async function cleanup() {
  if (!createdAccountIds.length) return;
  const admin = getIntegrationAdminClient();
  await admin.from("account_members").delete().in("account_id", createdAccountIds);
}

describe("E-084 compliance verification — integration contracts", () => {
  if (isIntegrationHarnessConfigured()) {
    afterAll(cleanup);
  }

  /**
   * HAPPY PATH: OCR-sourced compliance item → verify → provenance anchored.
   *
   * Asserts:
   * - record_compliance_value_human_verified returns no error
   * - provenance_events contains compliance_item.value_human_verified for the item
   * - verify_provenance_chain reports is_valid=true
   * - human_verified_at is now non-null on the compliance item
   */
  integrationIt(
    "happy path: record_compliance_value_human_verified anchors provenance and chain stays valid",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");

      const accountId = randomUUID();
      createdAccountIds.push(accountId);

      const { error: acctErr } = await admin.from("accounts").insert({
        id: accountId,
        name: `E-084 happy path probe ${accountId.slice(0, 8)}`,
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

      // Scaffold: document (required for document_extractions FK)
      const documentId = randomUUID();
      const { error: docErr } = await admin.from("documents").insert({
        id: documentId,
        account_id: accountId,
        name: "E-084 test document",
        storage_path: `test/e084-happy-${documentId}.pdf`,
        size_bytes: 100,
        scope: "account",
      });
      expect(docErr, `document insert: ${docErr?.message}`).toBeNull();

      // Scaffold: document_extraction (required for compliance_item FK)
      const extractionId = randomUUID();
      const { error: extractErr } = await admin.from("document_extractions").insert({
        id: extractionId,
        account_id: accountId,
        document_id: documentId,
        extractor: "manual",
        source_hash: "e084-test-hash-" + accountId.slice(0, 8),
        status: "completed",
      });
      expect(extractErr, `extraction insert: ${extractErr?.message}`).toBeNull();

      // Scaffold: compliance item with OCR source, unverified
      const itemId = randomUUID();
      const { error: itemErr } = await admin.from("tenancy_compliance_items").insert({
        id: itemId,
        account_id: accountId,
        status: "logged",
        ocr_source_extraction_id: extractionId,
      });
      expect(itemErr, `compliance item insert: ${itemErr?.message}`).toBeNull();

      // Act: call the verification RPC as the authenticated owner
      const { error: rpcErr } = await ownerClient.rpc(
        "record_compliance_value_human_verified",
        { p_account_id: accountId, p_item_id: itemId },
      );
      expect(rpcErr, `record_compliance_value_human_verified: ${rpcErr?.message}`).toBeNull();

      // Assert: provenance event anchored
      const { data: events, error: eventsErr } = await ownerClient
        .from("provenance_events")
        .select("event_type, entity_type, entity_id, metadata")
        .eq("account_id", accountId)
        .eq("entity_type", "compliance_item")
        .eq("entity_id", itemId);

      expect(eventsErr, `provenance_events read: ${eventsErr?.message}`).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe("compliance_item.value_human_verified");

      // Assert: chain is valid
      const { data: chain, error: chainErr } = await ownerClient.rpc(
        "verify_provenance_chain",
        { p_account_id: accountId },
      );
      expect(chainErr, `verify_provenance_chain: ${chainErr?.message}`).toBeNull();
      expect(
        chain?.is_valid,
        `chain is_valid=false — reason: ${chain?.first_broken_reason}`,
      ).toBe(true);
      expect(chain?.checked_count).toBeGreaterThanOrEqual(1);

      // Assert: human_verified_at is now set
      const { data: item, error: readErr } = await admin
        .from("tenancy_compliance_items")
        .select("human_verified_at")
        .eq("id", itemId)
        .single();
      expect(readErr, `compliance item read: ${readErr?.message}`).toBeNull();
      expect(item?.human_verified_at).toBeTruthy();
    },
  );

  /**
   * ATOMICITY DENY-TEST: provenance failure must roll back the verification write.
   *
   * record_compliance_verification_deny_test passes p_summary='' to
   * _append_evidence_provenance_event, which raises 'summary is required'.
   * With no EXCEPTION handler, the UPDATE rolls back.
   *
   * Asserts:
   * - The RPC call returns an error containing 'summary is required'
   * - human_verified_at is still null (UPDATE was rolled back)
   */
  integrationIt(
    "atomicity deny-test: provenance failure rolls back the verification write",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");

      const accountId = randomUUID();
      createdAccountIds.push(accountId);

      await admin.from("accounts").insert({
        id: accountId,
        name: `E-084 deny-test probe ${accountId.slice(0, 8)}`,
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

      const documentId = randomUUID();
      await admin.from("documents").insert({
        id: documentId,
        account_id: accountId,
        name: "E-084 deny-test document",
        storage_path: `test/e084-deny-${documentId}.pdf`,
        size_bytes: 100,
        scope: "account",
      });

      const extractionId = randomUUID();
      await admin.from("document_extractions").insert({
        id: extractionId,
        account_id: accountId,
        document_id: documentId,
        extractor: "manual",
        source_hash: "e084-deny-hash-" + accountId.slice(0, 8),
        status: "completed",
      });

      const itemId = randomUUID();
      await admin.from("tenancy_compliance_items").insert({
        id: itemId,
        account_id: accountId,
        status: "logged",
        ocr_source_extraction_id: extractionId,
      });

      // Act: call the deny-test helper — provenance will fail with empty summary
      const { error: denyErr } = await ownerClient.rpc(
        "record_compliance_verification_deny_test",
        { p_account_id: accountId, p_item_id: itemId },
      );

      // The RPC must return an error (provenance raised 'summary is required')
      expect(denyErr).not.toBeNull();
      expect(denyErr?.message).toMatch(/summary is required/i);

      // The UPDATE must have rolled back — human_verified_at is still null
      const { data: item, error: readErr } = await admin
        .from("tenancy_compliance_items")
        .select("human_verified_at")
        .eq("id", itemId)
        .single();
      expect(readErr, `compliance item read: ${readErr?.message}`).toBeNull();
      expect(item?.human_verified_at).toBeNull();
    },
  );
});
