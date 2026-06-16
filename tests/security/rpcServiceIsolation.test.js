import { beforeEach, describe, expect, it, vi } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const getPrimaryLeaseMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

vi.mock("../../src/services/leaseService.js", () => ({
  getPrimaryLease: (...args) => getPrimaryLeaseMock(...args),
  getDerivedLeaseStatus: vi.fn(() => "active"),
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("RPC service isolation contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    getPrimaryLeaseMock.mockReset();
    getPrimaryLeaseMock.mockResolvedValue(null);
  });

  it("scopes dashboard_snapshot to the caller-selected account and tenant fixtures", async () => {
    const { accountA } = isolationFixtures.accounts;
    const { tenantA1, tenantB1 } = isolationFixtures.users;

    rpcMock.mockResolvedValueOnce({
      data: [{ property_count: 1, overdue_amount: 0 }],
      error: null,
    });

    const { getDashboardSnapshot } = await import("../../src/services/dashboardService.js");

    await getDashboardSnapshot(accountA.id, {
      tenantId: tenantA1.tenantId,
      horizonDays: 7,
    });

    expect(rpcMock).toHaveBeenCalledWith("dashboard_snapshot", {
      p_account_id: accountA.id,
      p_tenant_id: tenantA1.tenantId,
      p_horizon_days: 7,
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "dashboard_snapshot",
      expect.objectContaining({ p_tenant_id: tenantB1.tenantId }),
    );
  });

  it("scopes finance_snapshot to the account and tenant fixtures used by tenant views", async () => {
    const { accountA } = isolationFixtures.accounts;
    const { tenantA1, tenantB1 } = isolationFixtures.users;

    rpcMock.mockResolvedValueOnce({
      data: [{ total_income: 1200, overdue_income: 0, due_soon_income: 0, outstanding_income: 0, property_finance: [] }],
      error: null,
    });

    const { getFinanceSnapshot } = await import("../../src/services/financeService.js");

    const result = await getFinanceSnapshot(accountA.id, tenantA1.tenantId);

    expect(rpcMock).toHaveBeenCalledWith("finance_snapshot", {
      p_account_id: accountA.id,
      p_tenant_id: tenantA1.tenantId,
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "finance_snapshot",
      expect.objectContaining({ p_tenant_id: tenantB1.tenantId }),
    );
    expect(result.property_finance).toEqual([]);
  });

  it("returns parsed dashboard hub extras rows from the RPC layer", async () => {
    const { accountA } = isolationFixtures.accounts;

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          item_key: "due-soon",
          item_type: "due_soon_summary",
          count_value: "3",
          property_label: null,
          city: null,
          days_vacant: null,
          link_path: "/finance?status=due&range=7d",
          sort_order: "20",
        },
      ],
      error: null,
    });

    const { getDashboardHubExtras } = await import("../../src/services/dashboardService.js");
    const result = await getDashboardHubExtras(accountA.id, { horizonDays: 7 });

    expect(result).toEqual([
      {
        item_key: "due-soon",
        item_type: "due_soon_summary",
        count_value: 3,
        property_label: "",
        city: "",
        days_vacant: null,
        link_path: "/finance?status=due&range=7d",
        sort_order: 20,
      },
    ]);
  });

  it("uses tenant_activity_feed with the requesting tenant fixture and never falls through without scope", async () => {
    const { accountA } = isolationFixtures.accounts;
    const { tenantA1, tenantB1 } = isolationFixtures.users;

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          event_key: "notification-1",
          event_type: "notification_sent",
          occurred_at: "2026-03-24T09:00:00Z",
          title: "Notice",
          detail: "Body",
          status: "info",
          link_path: "/tenant/payments",
          source_table: "notifications",
          source_id: "event-1",
        },
      ],
      error: null,
    });
    fromMock.mockImplementation((table) => {
      if (table === "payments") {
        return createThenableQuery({ data: [], error: null, count: 0 });
      }

      if (table === "maintenance_requests") {
        return createThenableQuery({ data: [], error: null });
      }

      if (table === "payment_events") {
        return createThenableQuery({ data: [], error: null });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { getTenantTimeline } = await import("../../src/services/tenantTimelineService.js");

    const result = await getTenantTimeline({
      accountId: accountA.id,
      tenant: {
        id: tenantA1.tenantId,
        propertyId: tenantA1.propertyId,
      },
      property: {
        id: tenantA1.propertyId,
      },
      limit: 25,
    });

    expect(result.items[0]).toMatchObject({
      key: "notification-1",
      type: "notification_sent",
      at: "2026-03-24T09:00:00Z",
      title: "Notice",
      linkPath: "/tenant/payments",
    });

    expect(rpcMock).toHaveBeenCalledWith("tenant_activity_feed", {
      p_account_id: accountA.id,
      p_tenant_id: tenantA1.tenantId,
      p_limit: 25,
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "tenant_activity_feed",
      expect.objectContaining({ p_tenant_id: tenantB1.tenantId }),
    );
  });

  it("returns a safe empty tenant timeline without issuing RPCs when tenant scope is missing", async () => {
    const { accountA } = isolationFixtures.accounts;

    const { getTenantTimeline } = await import("../../src/services/tenantTimelineService.js");

    const result = await getTenantTimeline({
      accountId: accountA.id,
      tenant: null,
    });

    expect(result).toEqual({
      items: [],
      summary: {
        openRequests: 0,
        overduePayments: 0,
        leaseWatch: 0,
      },
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns parsed invitation list and eligibility shapes", async () => {
    const { accountA } = isolationFixtures.accounts;

    fromMock.mockImplementation((table) => {
      if (table === "account_invitations") {
        return createThenableQuery({
          data: [
            {
              id: "invite-1",
              account_id: accountA.id,
              email: "Tenant.A1@Oasis.Test",
              role: "TENANT",
              invited_by: "owner-1",
              created_at: "2026-03-24T10:00:00Z",
              accepted_at: null,
              revoked_at: null,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    rpcMock.mockResolvedValueOnce({
      data: { ok: true, code: "eligible", message: "Eligible" },
      error: null,
    });

    const {
      checkAccountInvitationEligibility,
      listAccountInvitations,
    } = await import("../../src/services/invitationService.js");

    const invites = await listAccountInvitations(accountA.id);
    const eligibility = await checkAccountInvitationEligibility({
      accountId: accountA.id,
      email: "Tenant.A1@Oasis.Test",
      role: "TENANT",
    });

    expect(invites).toEqual([
      {
        id: "invite-1",
        account_id: accountA.id,
        account_name: "",
        email: "tenant.a1@oasis.test",
        role: "tenant",
        invited_by: "owner-1",
        created_at: "2026-03-24T10:00:00Z",
        accepted_at: null,
        revoked_at: null,
      },
    ]);
    expect(eligibility).toEqual({
      ok: true,
      code: "eligible",
      message: "Eligible",
    });
  });

  it("returns parsed root/admin mutation payloads from RPCs", async () => {
    const { accountA } = isolationFixtures.accounts;

    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "root-target-1",
            name: "Target Account",
            is_root: false,
            is_disabled: false,
            disabled_at: null,
            created_at: "2026-03-24T11:00:00Z",
            country_code: "GB",
            currency: "GBP",
            language: "en",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, account_id: "root-target-1", is_disabled: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          account_id: accountA.id,
          user_id: "user-1",
          old_role: "staff",
          role: "admin",
          changed: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          created: true,
          account_id: "self-serve-1",
          account_name: "My Account",
          role: "owner",
        },
        error: null,
      });

    const { rootListAccounts, rootSetAccountDisabled } = await import(
      "../../src/services/rootAccountService.js"
    );
    const { setAccountMemberRole } = await import("../../src/services/accountMemberService.js");
    const { finalizeSelfServeLandlordAccount } = await import(
      "../../src/services/selfServeSignupService.js"
    );

    const accounts = await rootListAccounts(accountA.id);
    const disableResult = await rootSetAccountDisabled({
      rootAccountId: accountA.id,
      targetAccountId: "root-target-1",
      disabled: true,
    });
    const roleResult = await setAccountMemberRole({
      accountId: accountA.id,
      targetUserId: "user-1",
      role: "admin",
    });
    const selfServeResult = await finalizeSelfServeLandlordAccount("My Account");

    expect(accounts[0]).toEqual({
      id: "root-target-1",
      name: "Target Account",
      is_root: false,
      is_disabled: false,
      disabled_at: null,
      created_at: "2026-03-24T11:00:00Z",
      country_code: "GB",
      currency: "GBP",
      language: "en",
    });
    expect(disableResult).toEqual({
      ok: true,
      account_id: "root-target-1",
      is_disabled: true,
    });
    expect(roleResult).toEqual({
      ok: true,
      account_id: accountA.id,
      user_id: "user-1",
      old_role: "staff",
      role: "admin",
      changed: true,
    });
    expect(selfServeResult).toEqual({
      ok: true,
      created: true,
      account_id: "self-serve-1",
      account_name: "My Account",
      role: "owner",
      sandbox_mode: "production",
      sandbox_lifecycle_status: "active",
      demo_expires_at: null,
      subscription_plan: null,
      subscription_status: null,
      trial_ends_at: null,
      trial_source: null,
      billing_locked_at: null,
    });
  });
});
