import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    single: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    delete: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("table-backed service contracts", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns parsed billing subscriptions", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "billing_subscriptions") {
        return createThenableQuery({
          data: {
            id: "sub-1",
            account_id: "account-1",
            stripe_customer_id: "cus-1",
            stripe_subscription_id: "stripe-sub-1",
            stripe_price_id: "price-growth",
            status: "ACTIVE",
            current_period_start: "2026-03-01T00:00:00Z",
            current_period_end: "2026-04-01T00:00:00Z",
            cancel_at_period_end: false,
            trial_end: null,
            metadata: { plan_key: "growth" },
          },
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { getBillingSubscription } = await import("../../src/services/billingService.js");
    const result = await getBillingSubscription("account-1");

    expect(result).toMatchObject({
      id: "sub-1",
      account_id: "account-1",
      stripe_price_id: "price-growth",
      status: "active",
      metadata: { plan_key: "growth" },
    });
  });

  it("returns parsed account security settings with defaults", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "account_security_settings") {
        return createThenableQuery({
          data: {
            account_id: "account-1",
            role_change_target_threshold: "4",
            role_change_account_threshold: "8",
            role_change_window_minutes: "45",
            document_delete_actor_threshold: "6",
            document_delete_account_threshold: "12",
            document_delete_window_minutes: "20",
            export_retention_days: "30",
            surface_security_alerts_in_command_center: "true",
            security_command_center_min_severity: "ACTION",
            security_command_center_include_suspicious: "false",
          },
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { getAccountSecuritySettings } = await import(
      "../../src/services/securitySettingsService.js"
    );
    const result = await getAccountSecuritySettings("account-1");

    expect(result).toEqual({
      account_id: "account-1",
      role_change_target_threshold: 4,
      role_change_account_threshold: 8,
      role_change_window_minutes: 45,
      document_delete_actor_threshold: 6,
      document_delete_account_threshold: 12,
      document_delete_window_minutes: 20,
      export_retention_days: 30,
      surface_security_alerts_in_command_center: true,
      security_command_center_min_severity: "action",
      security_command_center_include_suspicious: false,
    });
  });

  it("returns parsed compliance items and document links", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "compliance_items") {
        return createThenableQuery({
          data: [
            {
              id: "comp-1",
              account_id: "account-1",
              property_id: "property-1",
              tenant_id: null,
              title: "Gas certificate",
              category: "GAS_SAFETY",
              due_date: "2026-04-10",
              status: "ACTIVE",
              reminder_window_days: "30",
              recurrence_interval_months: "12",
              notes: null,
              completed_at: null,
              last_completed_at: null,
              created_at: "2026-03-01T00:00:00Z",
              updated_at: "2026-03-02T00:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "compliance_document_links") {
        return createThenableQuery({
          data: [
            {
              id: "link-1",
              account_id: "account-1",
              compliance_item_id: "comp-1",
              document_id: "doc-1",
              created_at: "2026-03-03T00:00:00Z",
              documents: {
                id: "doc-1",
                account_id: "account-1",
                property_id: "property-1",
                tenant_id: null,
                name: "gas-cert.pdf",
                storage_path: "account/account-1/documents/gas-cert.pdf",
                mime_type: "application/pdf",
                tags: ["gas_safety"],
                created_at: "2026-03-03T00:00:00Z",
                upload_status: "ready",
              },
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { listComplianceItems, listComplianceDocumentLinks } = await import(
      "../../src/services/complianceService.js"
    );

    const items = await listComplianceItems({ accountId: "account-1", includeClosed: true });
    const links = await listComplianceDocumentLinks({ accountId: "account-1" });

    expect(items).toEqual([
      expect.objectContaining({
        id: "comp-1",
        category: "gas_safety",
        status: "active",
        reminder_window_days: 30,
        recurrence_interval_months: 12,
      }),
    ]);

    expect(links).toEqual([
      expect.objectContaining({
        id: "link-1",
        compliance_item_id: "comp-1",
        document_id: "doc-1",
        documents: expect.objectContaining({
          id: "doc-1",
          name: "gas-cert.pdf",
          upload_status: "ready",
        }),
      }),
    ]);
  });
});
