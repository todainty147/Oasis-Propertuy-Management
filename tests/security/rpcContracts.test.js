import { describe, expect, it } from "vitest";

import {
  EMPTY_DASHBOARD_SNAPSHOT,
  EMPTY_FINANCE_SNAPSHOT,
  RpcContractError,
  parseCommandCenterItemRow,
  parseDashboardHubExtraRow,
  parseDashboardSnapshotRow,
  parseFinanceSnapshotRow,
  parseAccountMemberRoleResult,
  parseInvitationEligibilityRow,
  parseInvitationRow,
  parseRpcRows,
  parseRootAccountMutationRow,
  parseRootAccountRow,
  parseSelfServeLandlordAccountResult,
  parseTenantActivityFeedRow,
  parseSecurityObservabilityEventRow,
} from "../../src/services/rpcContracts.js";

describe("rpc contracts", () => {
  it("returns dashboard defaults for a missing snapshot row", () => {
    expect(parseDashboardSnapshotRow(null)).toEqual(EMPTY_DASHBOARD_SNAPSHOT);
  });

  it("normalizes finance snapshot property rows into the current UI shape", () => {
    const result = parseFinanceSnapshotRow({
      total_income: "300",
      overdue_income: "100",
      due_soon_income: "75",
      outstanding_income: "175",
      property_finance: [
        {
          property_id: "property-1",
          address: "11 Starlight Avenue",
          city: "London",
          rent: "1200",
          paid: "300",
          remaining: "900",
          payment_status: "partial",
        },
      ],
    });

    expect(result.total_income).toBe(300);
    expect(result).not.toBe(EMPTY_FINANCE_SNAPSHOT);
    expect(result.property_finance).toEqual([
      {
        propertyId: "property-1",
        address: "11 Starlight Avenue",
        city: "London",
        rent: 1200,
        paid: 300,
        remaining: 900,
        paymentStatus: "partial",
      },
    ]);
  });

  it("coerces command center rows into a stable item contract", () => {
    const row = parseCommandCenterItemRow({
      item_key: "payment-1",
      item_type: "overdue_payment",
      category: "finance",
      severity: "urgent",
      bucket: "urgent",
      amount: "1234.56",
      age_hours: "48",
      due_days: "3",
      resolved_state: "false",
    });

    expect(row.amount).toBe(1234.56);
    expect(row.age_hours).toBe(48);
    expect(row.due_days).toBe(3);
    expect(row.resolved_state).toBe(false);
  });

  it("preserves security observability metadata and boolean fields", () => {
    const row = parseSecurityObservabilityEventRow({
      id: "evt-1",
      guard_denied: "true",
      metadata: { request_id: "abc123" },
    });

    expect(row.id).toBe("evt-1");
    expect(row.guard_denied).toBe(true);
    expect(row.metadata).toEqual({ request_id: "abc123" });
  });

  it("normalizes dashboard extras, invitation rows, and tenant activity rows", () => {
    const extra = parseDashboardHubExtraRow({
      item_key: "due-soon",
      count_value: "4",
      days_vacant: "31",
    });
    const invite = parseInvitationRow({
      id: "invite-1",
      email: "Tenant.A1@Oasis.Test ",
      role: "TENANT",
    });
    const eligibility = parseInvitationEligibilityRow({
      ok: "true",
      code: "eligible",
      message: "Looks good",
    });
    const tenantEvent = parseTenantActivityFeedRow({
      event_key: "notification-1",
      event_type: "notification_sent",
      occurred_at: "2026-03-24T09:00:00Z",
      source_id: "evt-1",
    });

    expect(extra.count_value).toBe(4);
    expect(extra.days_vacant).toBe(31);
    expect(invite.email).toBe("tenant.a1@oasis.test");
    expect(invite.role).toBe("tenant");
    expect(eligibility.ok).toBe(true);
    expect(tenantEvent.source_id).toBe("evt-1");
  });

  it("normalizes root/admin mutation payloads", () => {
    const rootAccount = parseRootAccountRow({
      id: "account-1",
      name: "Root",
      is_root: "true",
      is_disabled: "false",
    });
    const rootMutation = parseRootAccountMutationRow({
      ok: "true",
      account_id: "account-2",
      is_disabled: "true",
    });
    const memberRole = parseAccountMemberRoleResult({
      ok: true,
      account_id: "account-2",
      user_id: "user-1",
      old_role: "STAFF",
      role: "ADMIN",
      changed: "true",
    });
    const selfServe = parseSelfServeLandlordAccountResult({
      ok: 1,
      created: "false",
      account_id: "account-3",
      account_name: "My Account",
      role: "OWNER",
    });

    expect(rootAccount.is_root).toBe(true);
    expect(rootMutation.is_disabled).toBe(true);
    expect(memberRole.old_role).toBe("staff");
    expect(memberRole.role).toBe("admin");
    expect(selfServe.role).toBe("owner");
    expect(selfServe.created).toBe(false);
  });

  it("fails clearly when an RPC rowset is not an array", () => {
    expect(() => parseRpcRows(null, (value) => value, "test rows")).toThrow(RpcContractError);
    expect(() => parseRpcRows({}, (value) => value, "test rows")).toThrow(
      "test rows must be an array",
    );
  });
});
