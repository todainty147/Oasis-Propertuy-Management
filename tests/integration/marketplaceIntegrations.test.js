import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
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
  it("lets account managers persist fulfilment routes and marketplace jobs for in-scope work orders", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const initialRoute = await client.rpc("get_work_order_fulfilment_route", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
    });

    expect(initialRoute.error).toBeNull();
    expect(firstRow(initialRoute.data)).toMatchObject({
      account_id: accountId,
      work_order_id: workOrderId,
      route: "internal",
      is_persisted: false,
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
});
