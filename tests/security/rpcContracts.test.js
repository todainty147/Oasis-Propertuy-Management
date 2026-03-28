import { describe, expect, it } from "vitest";

import {
  EMPTY_DASHBOARD_SNAPSHOT,
  EMPTY_FINANCE_SNAPSHOT,
  EMPTY_MAINTENANCE_KPI_SNAPSHOT,
  EMPTY_WEEKLY_PORTFOLIO_SUMMARY,
  RpcContractError,
  parseLeaseAttentionItemRow,
  parseMaintenanceAttentionRow,
  parseMaintenanceKpiSnapshotRow,
  parsePlaybookStatusSnapshotRow,
  parsePortfolioAttentionItemRow,
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
  parsePropertyOperationalHealthSnapshotRow,
  parseSelfServeLandlordAccountResult,
  parseTenantActivityFeedRow,
  parseSecurityObservabilityEventRow,
  parseWeeklyPortfolioSummaryRow,
} from "../../src/services/rpcContracts.js";

describe("rpc contracts", () => {
  it("returns dashboard defaults for a missing snapshot row", () => {
    expect(parseDashboardSnapshotRow(null)).toEqual(EMPTY_DASHBOARD_SNAPSHOT);
    expect(parseWeeklyPortfolioSummaryRow(null)).toEqual(EMPTY_WEEKLY_PORTFOLIO_SUMMARY);
    expect(parseMaintenanceKpiSnapshotRow(null)).toEqual(EMPTY_MAINTENANCE_KPI_SNAPSHOT);
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

  it("normalizes remaining read-heavy rpc rows into stable contracts", () => {
    const portfolioAttention = parsePortfolioAttentionItemRow({
      item_key: "portfolio-1",
      item_type: "overdue_payment",
      amount: "1234.56",
      days_vacant: null,
      sort_order: "10",
    });
    const leaseAttention = parseLeaseAttentionItemRow({
      item_key: "lease-1",
      item_type: "lease_expiring_soon",
      lease_end_date: "2026-05-01",
      days_until_end: "30",
      sort_order: "20",
    });
    const maintenanceAttention = parseMaintenanceAttentionRow({
      item_type: "triage_over_24h",
      maintenance_request_id: "req-1",
      age_hours: "48",
    });
    const propertyHealth = parsePropertyOperationalHealthSnapshotRow({
      property_id: "property-1",
      property_label: "11 Starlight Avenue",
      score: "88",
      category: "healthy",
      reasons: [{ key: "maintenance_pressure", penalty: "6" }],
      overdue_rent_amount: "0",
      open_request_count: "1",
      active_work_order_count: "2",
      stalled_repair_count: "0",
      ack_overdue_count: "0",
      long_running_repair_count: "0",
      requests_90_count: "1",
      overdue_preventive_count: "0",
      due_soon_preventive_count: "1",
      overdue_compliance_count: "0",
      due_soon_compliance_count: "1",
      missing_compliance_count: "0",
      expired_lease_count: "0",
      expiring_lease_count: "1",
      renewal_in_progress_count: "0",
      recent_operating_expenses: "120",
      recent_maintenance_cost: "0",
      tenant_count: "1",
    });
    const playbook = parsePlaybookStatusSnapshotRow({
      settings: [{ rule_id: "rent_overdue_watch", enabled: true, config: { grace_days: 3 } }],
      open_run_counts: { rent_overdue_watch: 2 },
      recent_runs: [{ id: "run-1" }],
      recent_resolved_runs: [],
      recent_executions: [{ id: "exec-1" }],
      open_runs: "2",
      last_run_at: "2026-03-24T10:00:00Z",
      last_run_status: "recorded",
    });

    expect(portfolioAttention.amount).toBe(1234.56);
    expect(leaseAttention.days_until_end).toBe(30);
    expect(maintenanceAttention.age_hours).toBe(48);
    expect(propertyHealth.reasons[0]).toEqual({
      key: "maintenance_pressure",
      penalty: 6,
      amount: undefined,
      count: undefined,
    });
    expect(propertyHealth.signals.hasExpiringLease).toBe(true);
    expect(playbook.open_runs).toBe(2);
    expect(playbook.recent_executions[0]).toEqual({ id: "exec-1" });
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
