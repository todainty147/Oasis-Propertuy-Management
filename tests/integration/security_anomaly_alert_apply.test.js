import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("security_anomaly_alert_apply writes", () => {
  const admin = getIntegrationAdminClient();
  let alertId;
  let dedupeKey;

  async function seedAlert() {
    const { error } = await admin.from("security_anomaly_alerts").upsert(
      {
        id: alertId,
        account_id: isolationFixtures.accounts.accountA.id,
        alert_type: "integration_test_alert",
        severity: "action",
        status: "open",
        title: "Integration alert",
        summary: "Seeded alert for integration writes",
        metadata: { source: "integration-test" },
        dedupe_key: dedupeKey,
        alert_count: 1,
      },
      { onConflict: "id" },
    );

    if (error) throw error;
  }

  async function cleanupAlertArtifacts() {
    const { error: alertError } = await admin
      .from("security_anomaly_alerts")
      .delete()
      .eq("id", alertId);

    if (alertError) throw alertError;
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  beforeEach(async () => {
    alertId = randomUUID();
    dedupeKey = `integration-alert-${randomUUID()}`;
    await seedAlert();
  });

  afterEach(async () => {
    await cleanupAlertArtifacts();
  });

  it("allows owner A to acknowledge an open alert and records a security audit row", async () => {
    const { client, user } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("security_anomaly_alert_apply", {
      p_alert_id: alertId,
      p_operation: "acknowledge",
      p_classification: null,
      p_assigned_to_user_id: null,
      p_resolution_note: null,
    });

    expect(result.error).toBeNull();
    expect(result.data.status).toBe("acknowledged");
    expect(result.data.acknowledged_by_user_id).toBe(user.id);

    const { data: alertRow, error: alertError } = await admin
      .from("security_anomaly_alerts")
      .select("status, acknowledged_by_user_id")
      .eq("id", alertId)
      .single();

    expect(alertError).toBeNull();
    expect(alertRow.status).toBe("acknowledged");
    expect(alertRow.acknowledged_by_user_id).toBe(user.id);

    const { data: ledgerRows, error: ledgerError } = await admin
      .from("security_audit_ledger")
      .select("action, account_id, entity_type, entity_id")
      .eq("entity_type", "security_alert")
      .eq("entity_id", alertId)
      .eq("action", "security_alert_acknowledged");

    expect(ledgerError).toBeNull();
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].account_id).toBe(isolationFixtures.accounts.accountA.id);
  });

  it("denies owner B from changing an account A security alert", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const result = await client.rpc("security_anomaly_alert_apply", {
      p_alert_id: alertId,
      p_operation: "acknowledge",
      p_classification: null,
      p_assigned_to_user_id: null,
      p_resolution_note: null,
    });

    expectAccessDenied(result);
  });

  it("denies contractor A from changing an account A security alert", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("security_anomaly_alert_apply", {
      p_alert_id: alertId,
      p_operation: "acknowledge",
      p_classification: null,
      p_assigned_to_user_id: null,
      p_resolution_note: null,
    });

    expectAccessDenied(result);
  });

  it("allows owner A to resolve the alert with a note and persists only the seeded alert row", async () => {
    const { client, user } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("security_anomaly_alert_apply", {
      p_alert_id: alertId,
      p_operation: "resolve",
      p_classification: null,
      p_assigned_to_user_id: null,
      p_resolution_note: "integration resolution note",
    });

    expect(result.error).toBeNull();
    expect(result.data.status).toBe("resolved");
    expect(result.data.resolved_by_user_id).toBe(user.id);
    expect(result.data.resolution_note).toBe("integration resolution note");

    const { data: alertRow, error: alertError } = await admin
      .from("security_anomaly_alerts")
      .select("status, resolved_by_user_id, resolution_note")
      .eq("id", alertId)
      .single();

    expect(alertError).toBeNull();
    expect(alertRow.status).toBe("resolved");
    expect(alertRow.resolved_by_user_id).toBe(user.id);
    expect(alertRow.resolution_note).toBe("integration resolution note");
  });
});
