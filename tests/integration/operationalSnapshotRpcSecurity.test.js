import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("operational snapshot RPC isolation", () => {
  const admin = getIntegrationAdminClient();
  const createdLeaseIds = new Set();
  const createdTaskIds = new Set();
  const createdRunIds = new Set();
  const createdExecutionIds = new Set();
  const createdRuleKeys = new Set();

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdExecutionIds.size > 0) {
      const ids = Array.from(createdExecutionIds);
      createdExecutionIds.clear();
      const { error } = await admin.from("automation_execution_log").delete().in("id", ids);
      expect(error).toBeNull();
    }

    if (createdRunIds.size > 0) {
      const ids = Array.from(createdRunIds);
      createdRunIds.clear();
      const { error } = await admin.from("automation_runs").delete().in("id", ids);
      expect(error).toBeNull();
    }

    if (createdRuleKeys.size > 0) {
      const keys = Array.from(createdRuleKeys);
      createdRuleKeys.clear();
      const { error } = await admin
        .from("automation_rule_settings")
        .delete()
        .eq("account_id", isolationFixtures.accounts.accountA.id)
        .in("rule_id", keys);
      expect(error).toBeNull();
    }

    if (createdTaskIds.size > 0) {
      const ids = Array.from(createdTaskIds);
      createdTaskIds.clear();
      const { error } = await admin.from("preventive_maintenance_tasks").delete().in("id", ids);
      expect(error).toBeNull();
    }

    if (createdLeaseIds.size > 0) {
      const ids = Array.from(createdLeaseIds);
      createdLeaseIds.clear();
      const { error } = await admin.from("leases").delete().in("id", ids);
      expect(error).toBeNull();
    }
  });

  function soonDate(daysFromNow = 1) {
    const date = new Date(Date.now() + daysFromNow * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  async function createPreventiveTask(overrides = {}) {
    const id = randomUUID();
    const payload = {
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      title: "Integration roof inspection",
      category: "roofing",
      frequency: "quarterly",
      next_due_date: soonDate(1),
      notes: "operational snapshot test",
      status: "active",
      ...overrides,
    };

    const { error } = await admin.from("preventive_maintenance_tasks").insert(payload);
    expect(error).toBeNull();
    createdTaskIds.add(id);
    return payload;
  }

  async function createLease(overrides = {}) {
    const id = randomUUID();
    const payload = {
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      lease_start_date: soonDate(-30),
      lease_end_date: soonDate(5),
      renewal_status: "active",
      notice_period_days: 30,
      auto_renew: false,
      notes: "operational snapshot test",
      ...overrides,
    };

    const { error } = await admin.from("leases").insert(payload);
    expect(error).toBeNull();
    createdLeaseIds.add(id);
    return payload;
  }

  async function createPlaybookRows() {
    const ruleId = `integration_rule_${randomUUID()}`;
    const runId = randomUUID();
    const executionId = randomUUID();

    const settings = await admin.from("automation_rule_settings").insert({
      account_id: isolationFixtures.accounts.accountA.id,
      rule_id: ruleId,
      enabled: true,
      config: { source: "integration" },
    });
    expect(settings.error).toBeNull();
    createdRuleKeys.add(ruleId);

    const run = await admin.from("automation_runs").insert({
      id: runId,
      account_id: isolationFixtures.accounts.accountA.id,
      rule_id: ruleId,
      source_key: `integration:${runId}`,
      state: "open",
      severity: "action",
      title: "Integration automation run",
      body: "Seeded for operational snapshot coverage",
      entity_type: "property",
      entity_id: isolationFixtures.users.tenantA1.propertyId,
      link_path: "/dashboard",
      details: { source: "integration" },
    });
    expect(run.error).toBeNull();
    createdRunIds.add(runId);

    const execution = await admin.from("automation_execution_log").insert({
      id: executionId,
      account_id: isolationFixtures.accounts.accountA.id,
      rule_id: ruleId,
      event_key: `integration:${executionId}`,
      execution_type: "rule_evaluated",
      status: "recorded",
      entity_type: "property",
      entity_id: isolationFixtures.users.tenantA1.propertyId,
      title: "Integration automation execution",
      details: { source: "integration" },
    });
    expect(execution.error).toBeNull();
    createdExecutionIds.add(executionId);

    return { ruleId, runId, executionId };
  }

  it("allows managers to read operational attention and KPI snapshots for their account", async () => {
    const task = await createPreventiveTask();
    const lease = await createLease();
    const playbook = await createPlaybookRows();
    const { client } = await signInAsFixtureUser("staffA");

    const preventive = await client.rpc("preventive_maintenance_attention", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_due_soon_days: 14,
      p_limit: 10,
    });
    expect(preventive.error).toBeNull();
    expect(preventive.data.some((row) => row.item_key === `preventive-due-soon-${task.id}`)).toBe(
      true,
    );

    const leaseItems = await client.rpc("lease_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 10,
      p_expiring_days: 60,
    });
    expect(leaseItems.error).toBeNull();
    expect(leaseItems.data.some((row) => row.item_key === `lease-expiring-${lease.id}`)).toBe(true);

    const kpi = await client.rpc("maintenance_kpi_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
    });
    expect(kpi.error).toBeNull();
    const kpiRow = firstRow(kpi.data);
    expect(kpiRow).toBeTruthy();
    expect(Number(kpiRow.open_requests)).toBeGreaterThanOrEqual(1);
    expect(kpiRow.req_by_status).toBeTruthy();

    const playbookSnapshot = await client.rpc("playbook_status_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_recent_limit: 5,
    });
    expect(playbookSnapshot.error).toBeNull();
    const playbookRow = firstRow(playbookSnapshot.data);
    expect(playbookRow).toBeTruthy();
    expect(playbookRow.settings.some((row) => row.rule_id === playbook.ruleId)).toBe(true);
    expect(playbookRow.recent_runs.some((row) => row.id === playbook.runId)).toBe(true);
    expect(playbookRow.recent_executions.some((row) => row.id === playbook.executionId)).toBe(true);
  });

  it("denies cross-account and non-manager callers from manager-only operational snapshots", async () => {
    const managerSurfaces = [
      {
        fn: "preventive_maintenance_attention",
        args: { p_account_id: isolationFixtures.accounts.accountB.id },
      },
      {
        fn: "maintenance_kpi_snapshot",
        args: { p_account_id: isolationFixtures.accounts.accountB.id },
      },
      {
        fn: "playbook_status_snapshot",
        args: { p_account_id: isolationFixtures.accounts.accountB.id },
      },
      {
        fn: "lease_attention_items",
        args: { p_account_id: isolationFixtures.accounts.accountB.id },
      },
    ];

    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    for (const surface of managerSurfaces) {
      const result = await ownerAClient.rpc(surface.fn, surface.args);
      expectAccessDenied(result);
    }

    const tenantSurfaces = managerSurfaces.map((surface) => ({
      ...surface,
      args: { p_account_id: isolationFixtures.accounts.accountA.id },
    }));
    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    for (const surface of tenantSurfaces) {
      const result = await tenantClient.rpc(surface.fn, surface.args);
      expectAccessDenied(result);
    }

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    for (const surface of tenantSurfaces) {
      const result = await contractorClient.rpc(surface.fn, surface.args);
      expectAccessDenied(result);
    }
  });

  it("allows dashboard hub extras through tenant scope while denying omitted or foreign tenant scope", async () => {
    await createPreventiveTask();

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const managerResult = await ownerClient.rpc("dashboard_hub_extras", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });
    expect(managerResult.error).toBeNull();
    expect(Array.isArray(managerResult.data)).toBe(true);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantResult = await tenantClient.rpc("dashboard_hub_extras", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_horizon_days: 7,
    });
    expect(tenantResult.error).toBeNull();
    expect(Array.isArray(tenantResult.data)).toBe(true);

    const omittedScope = await tenantClient.rpc("dashboard_hub_extras", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });
    expectAccessDenied(omittedScope);

    const foreignTenantScope = await tenantClient.rpc("dashboard_hub_extras", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_horizon_days: 7,
    });
    expectAccessDenied(foreignTenantScope);
  });
});
