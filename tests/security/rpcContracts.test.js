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
  parseAccountMemberRoleAssignmentResult,
  parseAccountSandboxStatusRow,
  parseAccountOwnerContactRow,
  parseAccountRoleAssignmentMemberRow,
  parseAccountRoleRow,
  parseInvitationEligibilityRow,
  parseInvitationRow,
  parseRpcRows,
  parseRootAccountMutationRow,
  parseRootAccountRow,
  parseSandboxFixtureSeedResult,
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
        // P0 typed balance fields — null/false when absent from source row
        balanceState: null,
        reasonCode: null,
        outstandingMinor: null,
        paidMinor: null,
        expectedMinor: null,
        accrualThrough: null,
        coverageStart: null,
        balanceBasis: null,
        isTenancyEnded: false,
        // Scope identifier — null when snapshot fetched without tenant scope
        scopeTenancyId: null,
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
      property_id: "property-1",
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
    expect(portfolioAttention.property_id).toBe("property-1");
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
      country_code: "GB",
      currency: "GBP",
      language: "en",
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
      sandbox_mode: "DEMO",
      sandbox_lifecycle_status: "ACTIVE",
      demo_expires_at: "2026-04-26T00:00:00Z",
    });
    const sandboxStatus = parseAccountSandboxStatusRow({
      account_id: "account-3",
      mode: "DEMO",
      lifecycle_status: "RESET_REQUESTED",
      seeded_fixture_version: "demo-fixtures-v1",
      demo_expires_at: "2026-04-26T00:00:00Z",
      reset_pending: "true",
      is_demo: "true",
    });
    const sandboxSeed = parseSandboxFixtureSeedResult({
      account_id: "account-3",
      seeded_fixture_version: "demo-fixtures-v1",
      reset_performed: "false",
      property_count: "2",
      tenant_count: "1",
      contractor_count: "1",
      payment_count: "2",
      maintenance_request_count: "2",
      work_order_count: "1",
      compliance_item_count: "2",
      lease_count: "1",
      document_request_count: "1",
    });

    expect(rootAccount.is_root).toBe(true);
    expect(rootAccount.country_code).toBe("GB");
    expect(rootAccount.currency).toBe("GBP");
    expect(rootAccount.language).toBe("en");
    expect(rootMutation.is_disabled).toBe(true);
    expect(memberRole.old_role).toBe("staff");
    expect(memberRole.role).toBe("admin");
    expect(selfServe.role).toBe("owner");
    expect(selfServe.created).toBe(false);
    expect(selfServe.sandbox_mode).toBe("demo");
    expect(sandboxStatus.mode).toBe("demo");
    expect(sandboxStatus.reset_pending).toBe(true);
    expect(sandboxSeed.property_count).toBe(2);
    expect(sandboxSeed.document_request_count).toBe(1);
  });

  it("normalizes custom role management rpc rows", () => {
    const role = parseAccountRoleRow({
      role_id: "role-1",
      name: "Portfolio Ops",
      permission_keys: [" Finance.Read ", "documents.upload", "", null],
      member_count: "3",
      is_system: "false",
    });
    const member = parseAccountRoleAssignmentMemberRow({
      user_id: "user-1",
      email: " Staff.A1@Oasis.Test ",
      legacy_role: "STAFF",
      role_id: "role-1",
      role_name: "portfolio ops",
    });
    const assignment = parseAccountMemberRoleAssignmentResult({
      ok: "true",
      account_id: "account-1",
      user_id: "user-1",
      legacy_role: "ADMIN",
      role_id: "role-1",
      role_name: "portfolio ops",
    });

    expect(role).toEqual({
      id: "role-1",
      name: "Portfolio Ops",
      permissionKeys: ["finance.read", "documents.upload"],
      memberCount: 3,
      isSystem: false,
    });
    expect(member).toEqual({
      userId: "user-1",
      email: "staff.a1@oasis.test",
      legacyRole: "staff",
      roleId: "role-1",
      roleName: "portfolio ops",
    });
    expect(assignment).toEqual({
      ok: true,
      accountId: "account-1",
      userId: "user-1",
      legacyRole: "admin",
      roleId: "role-1",
      roleName: "portfolio ops",
    });
  });

  it("normalizes account owner contact rpc rows", () => {
    expect(
      parseAccountOwnerContactRow({
        owner_user_id: "owner-1",
        owner_email: " Owner@Oasis.Test ",
      }),
    ).toEqual({
      ownerUserId: "owner-1",
      ownerEmail: "owner@oasis.test",
    });
  });

  it("fails clearly when an RPC rowset is not an array", () => {
    expect(() => parseRpcRows(null, (value) => value, "test rows")).toThrow(RpcContractError);
    expect(() => parseRpcRows({}, (value) => value, "test rows")).toThrow(
      "test rows must be an array",
    );
  });
});
