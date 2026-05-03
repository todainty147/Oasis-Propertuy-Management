import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    functions: {
      invoke: (...args) => invokeMock(...args),
    },
  },
}));

vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

describe("marketplace integration service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invokeMock.mockReset();
    const store = new Map();
    global.window = {
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
          store.set(key, String(value));
        },
        removeItem: (key) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
    };
  });

  it("falls back to local route state when marketplace RPCs are not deployed yet", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "Could not find the function public.get_work_order_fulfilment_route in the schema cache",
      },
    });

    window.localStorage.setItem(
      "oasis_marketplace_routes_v1",
      JSON.stringify({
        "account-1": {
          "work-order-1": "hybrid",
        },
      }),
    );

    const { getFulfilmentRoute } = await import("../../src/services/marketplaceIntegrationService.js");

    await expect(
      getFulfilmentRoute({ accountId: "account-1", workOrderId: "work-order-1" }),
    ).resolves.toBe("hybrid");
  });

  it("merges backend jobs with existing browser-local jobs so legacy handoffs stay visible", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          account_id: "account-1",
          work_order_id: "work-order-1",
          provider_key: "checkatrade",
          country_code: "GB",
          trade_category: "plumbing",
          external_job_id: "",
          external_reference: "",
          external_url: "",
          status: "ready_to_submit",
          submission_mode: "api",
          title: "Backend job",
          description: "",
          urgency: "",
          postcode: "",
          city: "London",
          property_label: "10 Market Street",
          contact_name: "",
          contact_email: "",
          contact_phone: "",
          consent_confirmed_at: null,
          submitted_at: null,
          last_synced_at: null,
          last_error: "",
          request_payload: {},
          response_payload: {},
          metadata: {},
          created_by: null,
          updated_by: null,
          created_at: "2026-04-27T12:00:00.000Z",
          updated_at: "2026-04-27T12:00:00.000Z",
        },
      ],
      error: null,
    });

    window.localStorage.setItem(
      "oasis_marketplace_jobs_v1",
      JSON.stringify([
        {
          id: "mkp_legacy_job",
          accountId: "account-1",
          workOrderId: "work-order-1",
          providerKey: "fixly",
          countryCode: "PL",
          tradeCategory: "electrician",
          externalJobId: "",
          externalReference: "",
          externalUrl: "",
          status: "draft",
          submissionMode: "manual",
          title: "Legacy local job",
          description: "",
          urgency: "",
          postcode: "",
          city: "Warsaw",
          propertyLabel: "Legacy block",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          consentConfirmedAt: null,
          submittedAt: null,
          lastSyncedAt: null,
          lastError: "",
          requestPayload: {},
          responsePayload: {},
          metadata: {},
          createdAt: "2026-04-27T11:00:00.000Z",
          updatedAt: "2026-04-27T11:00:00.000Z",
        },
      ]),
    );

    const { getMarketplaceJobsForWorkOrder } = await import("../../src/services/marketplaceIntegrationService.js");
    const jobs = await getMarketplaceJobsForWorkOrder({
      accountId: "account-1",
      workOrderId: "work-order-1",
    });

    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "11111111-1111-1111-1111-111111111111", providerKey: "checkatrade" }),
        expect.objectContaining({ id: "mkp_legacy_job", providerKey: "fixly" }),
      ]),
    );
  });

  it("updates legacy local jobs without requiring backend RPCs", async () => {
    window.localStorage.setItem(
      "oasis_marketplace_jobs_v1",
      JSON.stringify([
        {
          id: "mkp_local_1",
          accountId: "account-1",
          workOrderId: "work-order-1",
          providerKey: "fixly",
          countryCode: "PL",
          tradeCategory: "electrician",
          externalJobId: "",
          externalReference: "",
          externalUrl: "",
          status: "draft",
          submissionMode: "manual",
          title: "Legacy local job",
          description: "",
          urgency: "",
          postcode: "",
          city: "Warsaw",
          propertyLabel: "Legacy block",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          consentConfirmedAt: null,
          submittedAt: null,
          lastSyncedAt: null,
          lastError: "",
          requestPayload: {},
          responsePayload: {},
          metadata: {},
          createdAt: "2026-04-27T11:00:00.000Z",
          updatedAt: "2026-04-27T11:00:00.000Z",
        },
      ]),
    );

    const { updateMarketplaceJobStatus } = await import("../../src/services/marketplaceIntegrationService.js");
    await updateMarketplaceJobStatus({
      accountId: "account-1",
      marketplaceJobId: "mkp_local_1",
      status: "submitted",
      payload: { source: "manual" },
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem("oasis_marketplace_jobs_v1"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mkp_local_1",
          status: "submitted",
          responsePayload: { source: "manual" },
        }),
      ]),
    );
  });

  it("persists account-level marketplace settings through the secured RPC seam", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          provider_key: "checkatrade",
          enabled: true,
          configuration: {
            live_submission_enabled: false,
          },
          updated_at: "2026-04-27T14:00:00.000Z",
        },
      ],
      error: null,
    });

    const { upsertMarketplaceIntegrationSetting } = await import("../../src/services/marketplaceIntegrationService.js");
    const result = await upsertMarketplaceIntegrationSetting({
      accountId: "account-1",
      providerKey: "checkatrade",
      enabled: true,
      configuration: {
        live_submission_enabled: false,
      },
    });

    expect(rpcMock).toHaveBeenCalledWith("upsert_marketplace_integration_setting", {
      p_account_id: "account-1",
      p_provider_key: "checkatrade",
      p_enabled: true,
      p_configuration: {
        live_submission_enabled: false,
      },
    });
    expect(result).toMatchObject({
      providerKey: "checkatrade",
      enabled: true,
      configuration: {
        live_submission_enabled: false,
      },
    });
  });

  it("submits persisted marketplace handoffs through the Edge Function seam", async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        providerKey: "checkatrade",
        marketplaceJobId: "11111111-1111-1111-1111-111111111111",
        status: "submitted",
        message: "Marketplace handoff was submitted through the configured Checkatrade transport.",
        liveSubmissionAvailable: true,
        manualFallbackRecommended: false,
        externalJobId: "provider-job-1",
        externalReference: "provider-ref-1",
        externalUrl: "https://provider.example/jobs/1",
        attemptCount: 1,
        maxAttempts: 3,
        preparedPayload: {
          title: "Leaking boiler",
        },
      },
      error: null,
    });

    const { submitMarketplaceJobToProvider } = await import("../../src/services/marketplaceIntegrationService.js");
    const result = await submitMarketplaceJobToProvider({
      accountId: "account-1",
      marketplaceJobId: "11111111-1111-1111-1111-111111111111",
    });

    expect(invokeMock).toHaveBeenCalledWith("submit-marketplace-handoff", {
      body: {
        accountId: "account-1",
        marketplaceJobId: "11111111-1111-1111-1111-111111111111",
      },
    });
    expect(result).toMatchObject({
      ok: true,
      providerKey: "checkatrade",
      marketplaceJobId: "11111111-1111-1111-1111-111111111111",
      status: "submitted",
      liveSubmissionAvailable: true,
      manualFallbackRecommended: false,
      externalJobId: "provider-job-1",
      externalReference: "provider-ref-1",
      externalUrl: "https://provider.example/jobs/1",
      attemptCount: 1,
      maxAttempts: 3,
      preparedPayload: {
        title: "Leaking boiler",
      },
    });
  });
});
