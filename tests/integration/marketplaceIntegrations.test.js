import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function expectAccessDenied(result) {
  expect(result.error).toBeTruthy();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("access denied") ||
      message.includes("not authenticated") ||
      message.includes("permission") ||
      message.includes("not found"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("marketplace integrations", () => {
  const admin = getIntegrationAdminClient();

  it("lets account managers persist fulfilment routes and marketplace jobs for in-scope work orders", async () => {
    const users = await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const updateSetting = await client.rpc("upsert_marketplace_integration_setting", {
      p_account_id: accountId,
      p_provider_key: "checkatrade",
      p_enabled: true,
      p_configuration: {
        live_submission_enabled: false,
      },
    });

    expect(updateSetting.error).toBeNull();
    expect(firstRow(updateSetting.data)).toMatchObject({
      provider_key: "checkatrade",
      enabled: true,
      configuration: {
        live_submission_enabled: false,
      },
    });

    const settings = await client.rpc("list_marketplace_integration_settings", {
      p_account_id: accountId,
    });

    expect(settings.error).toBeNull();
    expect(settings.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider_key: "checkatrade",
          enabled: true,
        }),
        expect.objectContaining({
          provider_key: "fixly",
          enabled: false,
        }),
      ]),
    );

    const initialRoute = await client.rpc("get_work_order_fulfilment_route", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
    });

    expect(initialRoute.error).toBeNull();
    expect(firstRow(initialRoute.data)).toMatchObject({
      account_id: accountId,
      work_order_id: workOrderId,
    });

    const persistedRoute = await client.rpc("set_work_order_fulfilment_route", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_route: "marketplace",
    });

    expect(persistedRoute.error).toBeNull();
    expect(firstRow(persistedRoute.data)).toMatchObject({
      account_id: accountId,
      work_order_id: workOrderId,
      route: "marketplace",
      is_persisted: true,
    });

    const createJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "plumbing",
      p_contact_name: "Alice Owner",
      p_contact_email: "owner.a@oasis.test",
      p_contact_phone: "+44 111 222 333",
      p_consent_confirmed: true,
      p_title: "Leaking boiler",
      p_description: "Urgent leak in kitchen boiler",
      p_urgency: "high",
      p_city: "London",
      p_property_label: "Flat 2, 10 Market Street",
      p_request_payload: { source: "integration" },
      p_metadata: { route: "marketplace" },
    });

    expect(createJob.error).toBeNull();
    const createdJob = firstRow(createJob.data);
    expect(createdJob).toMatchObject({
      account_id: accountId,
      work_order_id: workOrderId,
      provider_key: "checkatrade",
      trade_category: "plumbing",
      status: "ready_to_submit",
      submission_mode: "api",
    });

    const listJobs = await client.rpc("list_marketplace_jobs", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
    });

    expect(listJobs.error).toBeNull();
    expect(listJobs.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdJob.id,
          provider_key: "checkatrade",
        }),
      ]),
    );

    const updateStatus = await client.rpc("update_marketplace_job_status", {
      p_account_id: accountId,
      p_marketplace_job_id: createdJob.id,
      p_status: "quote_received",
      p_payload: {
        external_reference: "quote-1",
      },
    });

    expect(updateStatus.error).toBeNull();
    expect(firstRow(updateStatus.data)).toMatchObject({
      id: createdJob.id,
      status: "quote_received",
    });

    const markSubmitted = await client.rpc("mark_marketplace_job_submitted", {
      p_account_id: accountId,
      p_marketplace_job_id: createdJob.id,
      p_external_reference: "ext-quote-1",
      p_external_url: "https://example.test/quote/1",
      p_response_payload: {
        source: "manual",
      },
    });

    expect(markSubmitted.error).toBeNull();
    expect(firstRow(markSubmitted.data)).toMatchObject({
      id: createdJob.id,
      status: "submitted",
      external_reference: "ext-quote-1",
      external_url: "https://example.test/quote/1",
    });

    const activityRows = await admin
      .from("activity_log")
      .select("action, field, new_value, meta")
      .eq("account_id", accountId)
      .eq("entity_type", "work_order")
      .eq("entity_id", workOrderId)
      .in("action", [
        "marketplace_route_changed",
        "marketplace_job_created",
        "marketplace_job_status_changed",
        "marketplace_job_submitted",
      ])
      .order("created_at", { ascending: false });

    expect(activityRows.error).toBeNull();
    expect(activityRows.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "marketplace_route_changed",
          field: "fulfilment_route",
          new_value: "marketplace",
        }),
        expect.objectContaining({
          action: "marketplace_job_created",
          field: "provider_key",
          new_value: "checkatrade",
        }),
        expect.objectContaining({
          action: "marketplace_job_status_changed",
          field: "status",
          new_value: "quote_received",
        }),
        expect.objectContaining({
          action: "marketplace_job_submitted",
          field: "status",
          new_value: "submitted",
        }),
      ]),
    );

    const notifications = await admin
      .from("notifications")
      .select("recipient_user_id, type, entity_type, entity_id, link_path")
      .eq("account_id", accountId)
      .eq("entity_type", "work_order")
      .eq("entity_id", workOrderId)
      .in("type", [
        "marketplace_handoff_created",
        "marketplace_handoff_status_changed",
        "marketplace_handoff_submitted",
      ]);

    expect(notifications.error).toBeNull();
    expect(notifications.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: users.adminA.id,
          type: "marketplace_handoff_created",
          link_path: `/work-orders/${workOrderId}`,
        }),
        expect.objectContaining({
          recipient_user_id: users.staffA.id,
          type: "marketplace_handoff_submitted",
          link_path: `/work-orders/${workOrderId}`,
        }),
      ]),
    );
  });

  it("denies cross-account marketplace access for ordinary staff", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("list_marketplace_jobs", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
    });

    expectAccessDenied(result);
  });

  it("denies tenant access to manager-only marketplace RPCs", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("set_work_order_fulfilment_route", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_work_order_id: isolationSeedIds.workOrderIds.accountA,
      p_route: "marketplace",
    });

    expectAccessDenied(result);
  });

  it("denies tenant access to marketplace provider configuration", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("upsert_marketplace_integration_setting", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_provider_key: "checkatrade",
      p_enabled: true,
      p_configuration: {
        live_submission_enabled: false,
      },
    });

    expectAccessDenied(result);
  });

  it("lets root operators manage marketplace state inside a selected tenant account", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("rootOwner");
    const accountId = isolationFixtures.accounts.accountB.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountB;

    const routeResult = await client.rpc("set_work_order_fulfilment_route", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_route: "hybrid",
    });

    expect(routeResult.error).toBeNull();
    expect(firstRow(routeResult.data)).toMatchObject({
      account_id: accountId,
      work_order_id: workOrderId,
      route: "hybrid",
    });

    const createJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "fixly",
      p_trade_category: "electrician",
      p_consent_confirmed: false,
      p_title: "Root-created job",
      p_description: "Created through root support",
      p_urgency: "normal",
      p_city: "Warsaw",
      p_property_label: "Building B",
      p_metadata: { actor: "root" },
    });

    expect(createJob.error).toBeNull();
    expect(firstRow(createJob.data)).toMatchObject({
      account_id: accountId,
      work_order_id: workOrderId,
      provider_key: "fixly",
      status: "draft",
      submission_mode: "manual",
    });
  });

  it("surfaces actionable marketplace lifecycle states in the command center and records manager notifications", async () => {
    const users = await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const readyJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "plumbing",
      p_contact_name: "Alice Owner",
      p_contact_email: "owner.a@oasis.test",
      p_contact_phone: "+44 111 222 333",
      p_consent_confirmed: true,
      p_title: "Ready to submit",
      p_description: "Ready",
      p_metadata: { lifecycle: "ready" },
    });
    expect(readyJob.error).toBeNull();

    const failedJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "plumbing",
      p_contact_name: "Alice Owner",
      p_contact_email: "owner.a@oasis.test",
      p_contact_phone: "+44 111 222 333",
      p_consent_confirmed: true,
      p_title: "Failed handoff",
      p_description: "Failed",
      p_metadata: { lifecycle: "failed" },
    });
    expect(failedJob.error).toBeNull();
    const failedJobId = firstRow(failedJob.data)?.id;

    const failedUpdate = await client.rpc("update_marketplace_job_status", {
      p_account_id: accountId,
      p_marketplace_job_id: failedJobId,
      p_status: "failed",
      p_payload: { reason: "provider_timeout" },
    });
    expect(failedUpdate.error).toBeNull();

    const followUpJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "fixly",
      p_trade_category: "electrician",
      p_consent_confirmed: true,
      p_title: "Manual follow-up",
      p_description: "Manual follow-up",
      p_metadata: { lifecycle: "follow_up" },
    });
    expect(followUpJob.error).toBeNull();
    const followUpJobId = firstRow(followUpJob.data)?.id;

    const followUpUpdate = await client.rpc("update_marketplace_job_status", {
      p_account_id: accountId,
      p_marketplace_job_id: followUpJobId,
      p_status: "manual_follow_up",
      p_payload: { reason: "operator_review" },
    });
    expect(followUpUpdate.error).toBeNull();

    const quoteJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "myhammer",
      p_trade_category: "locksmith",
      p_consent_confirmed: true,
      p_title: "Quote received",
      p_description: "Quote received",
      p_metadata: { lifecycle: "quote" },
    });
    expect(quoteJob.error).toBeNull();
    const quoteJobId = firstRow(quoteJob.data)?.id;

    const quoteUpdate = await client.rpc("update_marketplace_job_status", {
      p_account_id: accountId,
      p_marketplace_job_id: quoteJobId,
      p_status: "quote_received",
      p_payload: { quote_reference: "mkp-quote-1" },
    });
    expect(quoteUpdate.error).toBeNull();

    const commandCenter = await client.rpc("command_center_items", {
      p_account_id: accountId,
      p_limit: 200,
    });

    expect(commandCenter.error).toBeNull();
    const marketplaceItems = (commandCenter.data || []).filter(
      (row) => row.source_table === "external_marketplace_jobs",
    );
    expect(marketplaceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_type: "marketplace_ready_to_submit",
          category: "marketplace",
          source_table: "external_marketplace_jobs",
        }),
        expect.objectContaining({
          item_type: "marketplace_failed_submission",
          category: "marketplace",
          severity: "urgent",
        }),
        expect.objectContaining({
          item_type: "marketplace_manual_follow_up",
          category: "marketplace",
          severity: "action",
        }),
        expect.objectContaining({
          item_type: "marketplace_quote_received",
          category: "marketplace",
          severity: "action",
        }),
      ]),
    );

    const statusChangeNotifications = await admin
      .from("notifications")
      .select("recipient_user_id, type, entity_type, entity_id, title")
      .eq("account_id", accountId)
      .eq("type", "marketplace_handoff_status_changed")
      .eq("entity_type", "work_order")
      .eq("entity_id", workOrderId);

    expect(statusChangeNotifications.error).toBeNull();
    expect(statusChangeNotifications.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: users.adminA.id,
          type: "marketplace_handoff_status_changed",
        }),
        expect.objectContaining({
          recipient_user_id: users.staffA.id,
          type: "marketplace_handoff_status_changed",
        }),
      ]),
    );
  });

  it("lets account managers store and list external marketplace job trades via service_role Edge Function RPC", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const createJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "plumbing",
      p_contact_name: "Alice Owner",
      p_contact_email: "owner.a@oasis.test",
      p_contact_phone: "+44 111 222 333",
      p_consent_confirmed: true,
      p_title: "Leaking boiler trades test",
      p_description: "Urgent leak in the kitchen",
      p_urgency: "high",
      p_city: "London",
      p_property_label: "Flat 1",
    });
    expect(createJob.error).toBeNull();
    const jobId = firstRow(createJob.data)?.id;
    expect(jobId).toBeTruthy();

    // Simulate Edge Function storing trades via service_role
    const storeTrades = await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: [
        { id: "t-1", name: "Alpha Plumbing Ltd", profileURL: "https://www.checkatrade.com/trades/alpha-plumbing" },
        { id: "t-2", name: "Beta Plumbers", profileURL: "https://www.checkatrade.com/trades/beta-plumbers" },
      ],
    });
    expect(storeTrades.error).toBeNull();
    expect(storeTrades.data).toHaveLength(2);

    // Account owner can read the stored trades
    const listTrades = await client.rpc("list_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
    });
    expect(listTrades.error).toBeNull();
    expect(listTrades.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trade_id: "t-1", name: "Alpha Plumbing Ltd" }),
        expect.objectContaining({ trade_id: "t-2", name: "Beta Plumbers" }),
      ]),
    );
  });

  it("denies tenants from reading external marketplace job trades", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("list_marketplace_job_trades", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_marketplace_job_id: "00000000-0000-0000-0000-000000000001",
    });

    expectAccessDenied(result);
  });

  it("denies contractors from reading external marketplace job trades", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("list_marketplace_job_trades", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_marketplace_job_id: "00000000-0000-0000-0000-000000000001",
    });

    expectAccessDenied(result);
  });

  it("denies cross-account access to external marketplace job trades", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("list_marketplace_job_trades", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_marketplace_job_id: "00000000-0000-0000-0000-000000000001",
    });

    expectAccessDenied(result);
  });

  it("replaces existing trades atomically when edge_store_marketplace_job_trades is called again", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const createJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "electrical",
      p_contact_name: "Alice Owner",
      p_contact_email: "owner.a@oasis.test",
      p_contact_phone: "+44 111 222 333",
      p_consent_confirmed: true,
      p_title: "Electrical fault",
      p_description: "Tripping fuse box",
      p_urgency: "high",
      p_city: "London",
      p_property_label: "Flat 2",
    });
    const jobId = firstRow(createJob.data)?.id;

    await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: [{ id: "old-1", name: "Old Electrician", profileURL: "" }],
    });

    await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: [{ id: "new-1", name: "New Electrician Ltd", profileURL: "https://www.checkatrade.com/trades/new-elec" }],
    });

    const listTrades = await client.rpc("list_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
    });
    expect(listTrades.error).toBeNull();
    expect(listTrades.data).toHaveLength(1);
    expect(firstRow(listTrades.data)).toMatchObject({ trade_id: "new-1", name: "New Electrician Ltd" });
  });

  it("clears existing trades when edge_store_marketplace_job_trades is called with an empty array", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const createJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "plumbing",
      p_contact_name: "Alice Owner",
      p_contact_email: "alice@example.test",
      p_contact_phone: "+44111222333",
      p_consent_confirmed: true,
      p_title: "Leak fix",
      p_description: "Dripping tap in kitchen",
      p_urgency: "low",
      p_postcode: "SW1A 1AA",
      p_city: "London",
      p_property_label: "1 Test Street",
      p_request_payload: {},
      p_metadata: {},
    });
    expect(createJob.error).toBeNull();
    const jobId = firstRow(createJob.data)?.id;

    await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: [{ id: "t-1", name: "Alpha Plumbing", profileURL: "" }],
    });

    const beforeClear = await client.rpc("list_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
    });
    expect(beforeClear.data).toHaveLength(1);

    await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: [],
    });

    const afterClear = await client.rpc("list_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
    });
    expect(afterClear.error).toBeNull();
    expect(afterClear.data).toHaveLength(0);
  });

  it("rejects a non-array p_trades call and leaves existing trades intact", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const createJob = await client.rpc("create_marketplace_job", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_provider_key: "checkatrade",
      p_trade_category: "electrical",
      p_contact_name: "Bob Owner",
      p_contact_email: "bob@example.test",
      p_contact_phone: "+44111333444",
      p_consent_confirmed: true,
      p_title: "Wiring check",
      p_description: "Consumer unit inspection needed",
      p_urgency: "medium",
      p_postcode: "EC1A 1BB",
      p_city: "London",
      p_property_label: "2 Test Street",
      p_request_payload: {},
      p_metadata: {},
    });
    expect(createJob.error).toBeNull();
    const jobId = firstRow(createJob.data)?.id;

    await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: [{ id: "e-1", name: "Beta Electrical", profileURL: "" }],
    });

    const badCall = await admin.rpc("edge_store_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
      p_work_order_id: workOrderId,
      p_trades: {},
    });
    expect(badCall.error).not.toBeNull();

    const afterBadCall = await client.rpc("list_marketplace_job_trades", {
      p_account_id: accountId,
      p_marketplace_job_id: jobId,
    });
    expect(afterBadCall.error).toBeNull();
    expect(afterBadCall.data).toHaveLength(1);
    expect(firstRow(afterBadCall.data)).toMatchObject({ trade_id: "e-1", name: "Beta Electrical" });
  });
});
