import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

function t(key, params = {}) {
  if (key === "tenantPortal.card.documents") return "Documents available";
  if (key === "tenantPortal.documents.title") return "Documents available";
  if (key === "tenantPortal.documents.trustBody") return "Only documents shared with your tenancy appear here.";
  if (key === "tenantPortal.documents.recentTitle") return "Recently added";
  if (key === "tenantPortal.documents.priorityTitle") return "Priority documents";
  if (key === "tenantPortal.documents.attentionTitle") return "Needs attention";
  if (key === "tenantPortal.documents.currentTitle") return "Current";
  if (key === "tenantPortal.documents.olderTitle") return "Older documents";
  if (key === "tenantPortal.documents.highlight.actionRequired") return "Needs attention";
  if (key === "tenantPortal.documents.highlight.current") return "Current";
  if (key === "tenantPortal.documents.highlight.standard") return "Available";
  if (key === "tenantPortal.card.payments") return "Payment summary";
  if (key === "tenantPortal.payment.helper.overdue") return "You have overdue rent that needs attention soon.";
  if (key === "tenantPortal.payment.helper.due") return "You have payments due or coming up soon.";
  if (key === "tenantPortal.payment.helper.clear") return "There are no overdue or due items needing attention right now.";
  if (key === "tenantPortal.payments.upcoming") return "Items to review";
  if (key === "tenantPortal.payments.historyTitle") return "Payment history";
  if (key === "tenantPortal.payments.historySubtitle") return "See what has been paid, what is due, and which items need attention.";
  if (key === "dashboard.tenantPaymentHistory") return "Payment history (tenant)";
  if (key === "dashboard.tenantDueOverdueCount") return `${params.count} payments (due / overdue)`;
  if (key === "payments.amount") return "Amount";
  if (key === "payments.dueDate") return "Due date";
  if (key === "payments.paidAt") return "Paid at";
  if (key === "payments.status.paid") return "Paid";
  if (key === "payments.status.pending") return "Pending";
  if (key === "payments.status.overdue") return "Overdue";
  if (key === "common.refresh") return "Refresh";
  if (key === "documents.tag.LEASE") return "Lease";
  if (key === "tenantPortal.overview.title") return "Your home overview";
  return key;
}

vi.mock("../../src/context/AccountContext", () => ({
  useAccount: () => ({
    activeRole: "tenant",
    activeAccountId: "account-1",
    isRootOperator: false,
  }),
}));

vi.mock("../../src/context/TenantContext", () => ({
  useTenant: () => ({
    activeTenantId: "tenant-1",
  }),
}));

vi.mock("../../src/context/I18nContext", () => ({
  useI18n: () => ({ t }),
}));

vi.mock("../../src/layout/PageTitleContext", () => ({
  usePageTitle: () => ({
    setTitle: vi.fn(),
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams("horizon=week"), vi.fn()],
}));

vi.mock("../../src/components/TenantPortalOverview", () => ({
  default: () => React.createElement("div", { "data-testid": "tenant-portal-overview" }, "overview"),
}));

vi.mock("../../src/components/TenantMaintenanceDashboard", () => ({
  default: () => React.createElement("div", { "data-testid": "tenant-maintenance-dashboard" }, "maintenance"),
}));

describe("tenant portal UI contracts", () => {
  it("renders the tenant dashboard branch with the new overview and maintenance surfaces", async () => {
    const { default: Dashboard } = await import("../../src/pages/Dashboard.jsx");

    const html = renderToStaticMarkup(
      React.createElement(Dashboard, {
        loading: false,
        properties: [{ id: "property-1" }],
        payments: [],
      }),
    );

    expect(html).toContain("tenant-portal-overview");
    expect(html).toContain("tenant-maintenance-dashboard");
  });

  it("renders tenant payment summaries and history from real row data", async () => {
    const { TenantPaymentsContent } = await import("../../src/pages/TenantPayments.jsx");

    const html = renderToStaticMarkup(
      React.createElement(TenantPaymentsContent, {
        rows: [
          { id: "1", amount: 1200, status: "paid", paid_at: "2026-04-02", due_date: "2026-04-01" },
          { id: "2", amount: 850, status: "overdue", due_date: "2026-04-15" },
        ],
        loading: false,
        err: null,
        onRefresh: () => {},
        t,
      }),
    );

    expect(html).toContain("Payment summary");
    expect(html).toContain("Payment history");
    expect(html).toContain("Overdue");
    expect(html).toContain("850");
  });

  it("renders tenant document trust copy and recent document preview", async () => {
    const { default: TenantDocumentsOverview } = await import("../../src/components/TenantDocumentsOverview.jsx");

    const html = renderToStaticMarkup(
      React.createElement(TenantDocumentsOverview, {
        groups: {
          total: 2,
          attention: [{ id: "doc-1", name: "Lease agreement.pdf", tags: ["LEASE"], tenant_highlight: "action_required" }],
          current: [{ id: "doc-2", name: "Inventory check.pdf", tags: [], tenant_highlight: "current" }],
          recent: [],
          older: [],
        },
        t,
      }),
    );

    expect(html).toContain("Documents available");
    expect(html).toContain("Only documents shared with your tenancy appear here.");
    expect(html).toContain("Lease agreement.pdf");
    expect(html).toContain("Lease");
    expect(html).toContain("Needs attention");
  });
});
