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
    range: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    filter: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    single: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("table-backed operational service contracts", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns parsed tenant rows on create", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "tenants") {
        return createThenableQuery({
          data: {
            id: "tenant-1",
            account_id: "account-1",
            property_id: "property-1",
            user_id: null,
            name: "Tenant A1",
            email: "TENANT.A1@OASIS.TEST",
            phone: "+447700900101",
            status: "ACTIVE",
            created_at: "2026-03-28T10:00:00Z",
            updated_at: "2026-03-28T10:00:00Z",
          },
          error: null,
        });
      }

      if (table === "properties") {
        return createThenableQuery({ data: null, error: null });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { createTenant } = await import("../../src/services/tenantService.js");
    const result = await createTenant({
      accountId: "account-1",
      name: "Tenant A1",
      email: "TENANT.A1@OASIS.TEST",
      phone: "+447700900101",
      propertyId: "property-1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "tenant-1",
        account_id: "account-1",
        property_id: "property-1",
        email: "tenant.a1@oasis.test",
        status: "active",
      }),
    );
  });

  it("returns parsed branding and contractor rating rows", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "account_branding") {
        return createThenableQuery({
          data: {
            account_id: "account-1",
            logo_url: "https://cdn.example.com/logo.png",
            primary_color: "#112233",
            accent_color: "#445566",
            company_name: "OASIS Rental",
            support_email: "support@oasis.test",
            support_phone: "+447700900102",
          },
          error: null,
        });
      }

      if (table === "contractor_ratings") {
        return createThenableQuery({
          data: {
            id: "rating-1",
            account_id: "account-1",
            work_order_id: "wo-1",
            contractor_user_id: "contractor-1",
            rating: "5",
            comment: "Great job",
            rated_by: "owner-1",
            created_at: "2026-03-28T11:00:00Z",
            updated_at: "2026-03-28T11:00:00Z",
          },
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { getAccountBranding } = await import("../../src/services/accountBrandingService.js");
    const { getContractorRatingByWorkOrder } = await import(
      "../../src/services/contractorRatingService.js"
    );

    const branding = await getAccountBranding("account-1");
    const rating = await getContractorRatingByWorkOrder("wo-1");

    expect(branding).toEqual(
      expect.objectContaining({
        account_id: "account-1",
        company_name: "OASIS Rental",
        support_email: "support@oasis.test",
      }),
    );

    expect(rating).toEqual(
      expect.objectContaining({
        id: "rating-1",
        work_order_id: "wo-1",
        rating: 5,
        comment: "Great job",
      }),
    );
  });

  it("returns parsed activity log and lease rows", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "activity_log") {
        return createThenableQuery({
          data: [
            {
              id: "log-1",
              account_id: "account-1",
              entity_type: "WORK_ORDER",
              entity_id: "wo-1",
              action: "STATUS_CHANGED",
              field: "status",
              old_value: "assigned",
              new_value: "completed",
              actor_user_id: "owner-1",
              actor_role: "OWNER",
              meta: { property_id: "property-1" },
              created_at: "2026-03-28T12:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "leases") {
        return createThenableQuery({
          data: [
            {
              id: "lease-1",
              account_id: "account-1",
              property_id: "property-1",
              tenant_id: "tenant-1",
              lease_start_date: "2026-01-01",
              lease_end_date: "2026-12-31",
              renewal_status: "ACTIVE",
              notice_period_days: "30",
              auto_renew: true,
              notes: "Current term",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-03-01T00:00:00Z",
              property: { address: "11 Starlight Avenue" },
              tenant: { name: "Tenant A1" },
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { fetchActivityLog } = await import("../../src/services/activityLogService.js");
    const { listLeases } = await import("../../src/services/leaseService.js");

    const logRows = await fetchActivityLog({ accountId: "account-1", propertyId: "property-1" });
    const leaseRows = await listLeases({ accountId: "account-1", limit: 10 });

    expect(logRows).toEqual([
      expect.objectContaining({
        id: "log-1",
        entity_type: "work_order",
        action: "status_changed",
        actor_role: "owner",
        meta: { property_id: "property-1" },
      }),
    ]);

    expect(leaseRows).toEqual([
      expect.objectContaining({
        id: "lease-1",
        propertyLabel: "11 Starlight Avenue",
        tenantLabel: "Tenant A1",
        renewal_status: "active",
        notice_period_days: 30,
        auto_renew: true,
      }),
    ]);
  });
});
