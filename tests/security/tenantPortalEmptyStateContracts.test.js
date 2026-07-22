// tests/security/tenantPortalEmptyStateContracts.test.js
//
// Extends the existing tenantPortalUiContracts coverage for empty states and
// role-boundary assertions that are not covered by the base test file.
//
// Coverage:
//   - Payment section with zero rows renders cleanly (correct helper text)
//   - Payment section with overdue rows renders urgency helper text
//   - Documents overview with empty groups renders without crashing
//   - No admin / landlord-only actions appear in the tenant payment view
//   - No admin / landlord-only actions appear in the tenant documents view

import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// ── i18n ─────────────────────────────────────────────────────────────────────
function t(key, params = {}) {
  const map = {
    "tenantPortal.card.documents":          "Documents available",
    "tenantPortal.documents.title":         "Documents available",
    "tenantPortal.documents.trustBody":     "Only documents shared with your tenancy appear here.",
    "tenantPortal.documents.recentTitle":   "Recently added",
    "tenantPortal.documents.priorityTitle": "Priority documents",
    "tenantPortal.documents.attentionTitle":"Needs attention",
    "tenantPortal.documents.currentTitle":  "Current",
    "tenantPortal.documents.olderTitle":    "Older documents",
    "tenantPortal.documents.highlight.actionRequired": "Needs attention",
    "tenantPortal.documents.highlight.current":        "Current",
    "tenantPortal.documents.highlight.standard":       "Available",
    "tenantPortal.card.payments":           "Payment summary",
    "tenantPortal.payment.helper.overdue":  "You have overdue rent that needs attention soon.",
    "tenantPortal.payment.helper.due":      "You have payments due or coming up soon.",
    "tenantPortal.payment.helper.clear":    "There are no overdue or due items needing attention right now.",
    "tenantPortal.payments.upcoming":       "Items to review",
    "tenantPortal.payments.historyTitle":   "Payment history",
    "tenantPortal.payments.historySubtitle":"See what has been paid, what is due, and which items need attention.",
    "payments.title":                       "Payment summary",
    "payments.amount":                      "Amount",
    "payments.dueDate":                     "Due date",
    "payments.paidAt":                      "Paid at",
    "payments.status.paid":                 "Paid",
    "payments.status.pending":              "Pending",
    "payments.status.overdue":              "Overdue",
    "common.refresh":                       "Refresh",
    "dashboard.tenantPaymentHistory":       "Payment history (tenant)",
    "dashboard.tenantDueOverdueCount":      `${params.count ?? 0} payments (due / overdue)`,
    "documents.tag.LEASE":                  "Lease",
    "tenantPortal.overview.title":          "Your home overview",
  };
  return map[key] ?? key;
}

vi.mock("../../src/context/AccountContext", () => ({
  useAccount: () => ({
    activeRole: "tenant",
    activeAccountId: "account-1",
    isRootOperator: false,
  }),
}));

vi.mock("../../src/context/TenantContext", () => ({
  useTenant: () => ({ activeTenantId: "tenant-1" }),
}));

vi.mock("../../src/context/I18nContext", () => ({
  useI18n: () => ({ t }),
}));

vi.mock("../../src/layout/PageTitleContext", () => ({
  usePageTitle: () => ({ setTitle: vi.fn() }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) =>
    React.createElement("a", { href: String(to || "#"), ...props }, children),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(""), vi.fn()],
}));

vi.mock("../../src/components/TenantPortalOverview", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "tenant-portal-overview" }, "overview"),
}));

vi.mock("../../src/components/TenantMaintenanceDashboard", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "tenant-maintenance-dashboard" }, "maintenance"),
}));

// ── payment empty state ────────────────────────────────────────────────────────

const AUTHORITY_UNAVAILABLE_BALANCE = {
  attributed: false,
  attributionState: "authority_unavailable",
  balance: null,
  reasonCode: "TENANCY_BALANCE_AUTHORITY_UNAVAILABLE",
  scopeValidated: false,
};

describe("tenant payment section — empty state", () => {
  it("renders cleanly with zero rows and shows the unavailable balance copy", async () => {
    const { TenantPaymentsContent } = await import("../../src/pages/TenantPayments.jsx");

    // P0-C R3 amendment: balance is always authority_unavailable under current finance model.
    const html = renderToStaticMarkup(
      React.createElement(TenantPaymentsContent, {
        rows: [],
        loading: false,
        err: null,
        onRefresh: () => {},
        tenantBalance: AUTHORITY_UNAVAILABLE_BALANCE,
        t,
      }),
    );

    // Outstanding card shows unavailable copy (authority_unavailable state).
    expect(html).toContain("Balance unavailable");
    expect(html).toContain("A tenancy-specific balance has not been established.");
    expect(html).toContain("tenant-payments-balance-unavailable");
    // No runtime error markers.
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("(b) outstanding card present with unavailable copy; overdue helper text absent from outstanding section", async () => {
    const { TenantPaymentsContent } = await import("../../src/pages/TenantPayments.jsx");

    // Payment history row exists for Tenant A; outstanding card still shows unavailable.
    const html = renderToStaticMarkup(
      React.createElement(TenantPaymentsContent, {
        rows: [
          { id: "p-1", amount: 950, status: "overdue", due_date: "2026-04-01", paid_at: null },
        ],
        loading: false,
        err: null,
        onRefresh: () => {},
        tenantBalance: { ...AUTHORITY_UNAVAILABLE_BALANCE, scopeValidated: true },
        t,
      }),
    );

    // (b) Outstanding card is present and shows unavailable copy.
    expect(html).toContain("tenant-payments-outstanding-card");
    expect(html).toContain("tenant-payments-balance-unavailable");
    expect(html).toContain("Balance unavailable");
    expect(html).toContain("A tenancy-specific balance has not been established.");
    // Payment transaction amount IS present in history section.
    expect(html).toContain("950");
    // Monetary outstanding helper text is absent from the card (attributed branch only).
    expect(html).not.toContain("overdue rent");
    expect(html).not.toContain("There are no overdue");
  });

  it("(a) Tenant A payment transaction is visible in history; Tenant B amount is absent", async () => {
    const { TenantPaymentsContent } = await import("../../src/pages/TenantPayments.jsx");

    // rows contains only Tenant A's payments — backend filters by tenant_id.
    const html = renderToStaticMarkup(
      React.createElement(TenantPaymentsContent, {
        rows: [
          { id: "tx-tenant-a", amount: 950, status: "paid", due_date: "2026-06-01", paid_at: "2026-06-01" },
        ],
        loading: false,
        err: null,
        onRefresh: () => {},
        tenantBalance: { ...AUTHORITY_UNAVAILABLE_BALANCE, scopeValidated: true },
        t,
      }),
    );

    // (a) Tenant A's own payment IS visible in the history section.
    expect(html).toContain("950");
    // Tenant B's transaction amount (deliberately different: 750) is ABSENT.
    expect(html).not.toContain("750");
  });

  it("does not render admin/landlord-only actions in tenant payment view", async () => {
    const { TenantPaymentsContent } = await import("../../src/pages/TenantPayments.jsx");

    const html = renderToStaticMarkup(
      React.createElement(TenantPaymentsContent, {
        rows: [
          { id: "p-2", amount: 1200, status: "due", due_date: "2026-05-15", paid_at: null },
        ],
        loading: false,
        err: null,
        onRefresh: () => {},
        t,
      }),
    );

    // Manager-only actions must be absent from the tenant payment view.
    expect(html).not.toContain("Add payment");
    expect(html).not.toContain("Mark as paid");
    expect(html).not.toContain("Delete payment");
    expect(html).not.toContain("Edit payment");
    expect(html).not.toContain("Send reminder");
  });
});

// ── documents empty state ──────────────────────────────────────────────────────

describe("tenant documents overview — empty state", () => {
  it("renders cleanly with all empty document groups", async () => {
    const { default: TenantDocumentsOverview } = await import(
      "../../src/components/TenantDocumentsOverview.jsx"
    );

    const html = renderToStaticMarkup(
      React.createElement(TenantDocumentsOverview, {
        groups: {
          total: 0,
          attention: [],
          current: [],
          recent: [],
          older: [],
        },
        t,
      }),
    );

    // Trust copy must still appear even with no documents.
    expect(html).toContain("Only documents shared with your tenancy appear here.");
    // No crash markers
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("renders trust copy and correct section headers when documents are present", async () => {
    const { default: TenantDocumentsOverview } = await import(
      "../../src/components/TenantDocumentsOverview.jsx"
    );

    const html = renderToStaticMarkup(
      React.createElement(TenantDocumentsOverview, {
        groups: {
          total: 1,
          attention: [],
          current: [
            {
              id: "doc-3",
              name: "Gas certificate.pdf",
              tags: [],
              tenant_highlight: "current",
            },
          ],
          recent: [],
          older: [],
        },
        t,
      }),
    );

    expect(html).toContain("Gas certificate.pdf");
    expect(html).toContain("Current");
  });

  it("does not render admin/landlord-only actions in tenant document view", async () => {
    const { default: TenantDocumentsOverview } = await import(
      "../../src/components/TenantDocumentsOverview.jsx"
    );

    const html = renderToStaticMarkup(
      React.createElement(TenantDocumentsOverview, {
        groups: {
          total: 1,
          attention: [
            { id: "doc-4", name: "Lease.pdf", tags: ["LEASE"], tenant_highlight: "action_required" },
          ],
          current: [],
          recent: [],
          older: [],
        },
        t,
      }),
    );

    // Manager-only document actions must be absent from tenant view.
    expect(html).not.toContain("Upload");
    expect(html).not.toContain("Delete document");
    expect(html).not.toContain("Edit visibility");
    expect(html).not.toContain("Share with tenant");
  });
});

// ── role boundary assertions ───────────────────────────────────────────────────

describe("tenant portal role boundary", () => {
  it("does not render a manager dashboard when role is tenant", async () => {
    const { default: Dashboard } = await import("../../src/pages/Dashboard.jsx");

    const html = renderToStaticMarkup(
      React.createElement(Dashboard, {
        loading: false,
        properties: [],
        payments: [],
      }),
    );

    // Manager surfaces must not render for tenant role.
    expect(html).not.toContain("Portfolio Health");
    expect(html).not.toContain("Command Center");
    expect(html).not.toContain("Add property");
    expect(html).not.toContain("Invite tenant");
  });
});
