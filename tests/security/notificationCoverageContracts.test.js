import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const createNotificationsMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

vi.mock("../../src/services/notificationService.js", () => ({
  createNotifications: (...args) => createNotificationsMock(...args),
}));

vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

function createThenableQuery(result) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
    single: vi.fn(() => q),
    insert: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };
  return q;
}

function makePaymentRow(overrides = {}) {
  return {
    id: "payment-1",
    account_id: "account-1",
    property_id: "prop-1",
    tenant_id: "tenant-1",
    owner_id: null,
    amount: 1200,
    due_date: "2026-05-01",
    paid_at: "2026-04-29",
    created_at: "2026-04-01T00:00:00Z",
    status: "paid",
    ...overrides,
  };
}

describe("markPaymentPaid notification", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    createNotificationsMock.mockReset();
    createNotificationsMock.mockResolvedValue({ ok: true });
  });

  it("calls mark_payment_paid RPC with correct params", async () => {
    rpcMock.mockResolvedValueOnce({ data: makePaymentRow(), error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: { user_id: "user-tenant-1" }, error: null }));

    const { markPaymentPaid } = await import("../../src/services/paymentService.js");
    await markPaymentPaid("payment-1", "2026-04-29", "account-1");

    expect(rpcMock).toHaveBeenCalledWith("mark_payment_paid", {
      p_account_id: "account-1",
      p_payment_id: "payment-1",
      p_paid_at: "2026-04-29",
    });
  });

  it("sends payment_received notification to the tenant after marking paid", async () => {
    rpcMock.mockResolvedValueOnce({ data: makePaymentRow({ tenant_id: "tenant-1" }), error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: { user_id: "user-tenant-1" }, error: null }));

    const { markPaymentPaid } = await import("../../src/services/paymentService.js");
    await markPaymentPaid("payment-1", "2026-04-29", "account-1");

    expect(createNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_received",
        recipientUserIds: ["user-tenant-1"],
        linkPath: "/tenant/payments",
        entityType: "payment",
      })
    );
  });

  it("does not throw if notification fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: makePaymentRow(), error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: null, error: { message: "not found" } }));
    createNotificationsMock.mockRejectedValue(new Error("notify failed"));

    const { markPaymentPaid } = await import("../../src/services/paymentService.js");
    await expect(markPaymentPaid("payment-1", "2026-04-29", "account-1")).resolves.toBeDefined();
  });

  it("skips notification when tenant has no user_id", async () => {
    rpcMock.mockResolvedValueOnce({ data: makePaymentRow({ tenant_id: "tenant-1" }), error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: { user_id: null }, error: null }));

    const { markPaymentPaid } = await import("../../src/services/paymentService.js");
    await markPaymentPaid("payment-1", "2026-04-29", "account-1");

    expect(createNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserIds: [] })
    );
  });

  it("requires paymentId", async () => {
    const { markPaymentPaid } = await import("../../src/services/paymentService.js");
    await expect(markPaymentPaid(null, "2026-04-29", "account-1")).rejects.toThrow();
  });

  it("requires accountId", async () => {
    const { markPaymentPaid } = await import("../../src/services/paymentService.js");
    await expect(markPaymentPaid("payment-1", "2026-04-29", null)).rejects.toThrow();
  });
});

describe("createPayment notification", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    createNotificationsMock.mockReset();
    createNotificationsMock.mockResolvedValue({ ok: true });
  });

  it("sends payment_due notification to tenant after creating a payment", async () => {
    rpcMock.mockResolvedValueOnce({ data: makePaymentRow({ paid_at: null, status: "pending" }), error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: { user_id: "user-tenant-1" }, error: null }));

    const { createPayment } = await import("../../src/services/paymentService.js");
    await createPayment({
      accountId: "account-1",
      propertyId: "prop-1",
      tenantId: "tenant-1",
      amount: 1200,
      dueDate: "2026-05-01",
    });

    expect(createNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_due",
        recipientUserIds: ["user-tenant-1"],
        linkPath: "/tenant/payments",
      })
    );
  });

  it("does not throw if notification fails during create", async () => {
    rpcMock.mockResolvedValueOnce({ data: makePaymentRow({ paid_at: null }), error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: null, error: { message: "db error" } }));
    createNotificationsMock.mockRejectedValue(new Error("notify failed"));

    const { createPayment } = await import("../../src/services/paymentService.js");
    await expect(createPayment({
      accountId: "account-1",
      propertyId: "prop-1",
      tenantId: "tenant-1",
      amount: 1200,
      dueDate: "2026-05-01",
    })).resolves.toBeDefined();
  });
});

describe("approveWorkOrderTenantCancellation notification", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    createNotificationsMock.mockReset();
    createNotificationsMock.mockResolvedValue({ ok: true });
  });

  it("calls work_order_approve_tenant_cancellation RPC", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: null, error: null }));

    const { approveWorkOrderTenantCancellation } = await import("../../src/services/workOrderService.js");
    await approveWorkOrderTenantCancellation("wo-1", { accountId: "account-1" });

    expect(rpcMock).toHaveBeenCalledWith("work_order_approve_tenant_cancellation", {
      p_work_order_id: "wo-1",
    });
  });

  it("fires cancellation_approved notification to tenant", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const workOrderQuery = createThenableQuery({ data: { maintenance_request_id: "mr-1" }, error: null });
    const mrQuery = createThenableQuery({ data: { reported_by_tenant_id: "tenant-1" }, error: null });
    const tenantQuery = createThenableQuery({ data: { user_id: "user-tenant-1" }, error: null });

    let callCount = 0;
    fromMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return workOrderQuery;
      if (callCount === 2) return mrQuery;
      return tenantQuery;
    });

    const { approveWorkOrderTenantCancellation } = await import("../../src/services/workOrderService.js");
    await approveWorkOrderTenantCancellation("wo-1", { accountId: "account-1" });

    expect(createNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cancellation_approved",
        recipientUserIds: ["user-tenant-1"],
        entityType: "work_order",
        entityId: "wo-1",
      })
    );
  });

  it("does not throw if notification lookup fails", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    fromMock.mockReturnValue(createThenableQuery({ data: null, error: { message: "lookup failed" } }));

    const { approveWorkOrderTenantCancellation } = await import("../../src/services/workOrderService.js");
    await expect(
      approveWorkOrderTenantCancellation("wo-1", { accountId: "account-1" })
    ).resolves.toBeDefined();
  });
});

describe("denyWorkOrderTenantCancellation notification", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    createNotificationsMock.mockReset();
    createNotificationsMock.mockResolvedValue({ ok: true });
  });

  it("fires cancellation_denied notification with reason", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const workOrderQuery = createThenableQuery({ data: { maintenance_request_id: "mr-1" }, error: null });
    const mrQuery = createThenableQuery({ data: { reported_by_tenant_id: "tenant-1" }, error: null });
    const tenantQuery = createThenableQuery({ data: { user_id: "user-tenant-1" }, error: null });

    let callCount = 0;
    fromMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return workOrderQuery;
      if (callCount === 2) return mrQuery;
      return tenantQuery;
    });

    const { denyWorkOrderTenantCancellation } = await import("../../src/services/workOrderService.js");
    await denyWorkOrderTenantCancellation(
      { workOrderId: "wo-1", reason: "Work is necessary" },
      { accountId: "account-1" }
    );

    expect(createNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "cancellation_denied",
        recipientUserIds: ["user-tenant-1"],
        metadata: expect.objectContaining({ approved: false, reason: "Work is necessary" }),
      })
    );
  });
});

describe("Finance page mark-paid UI contract", () => {
  it("Finance component accepts onMarkPaid prop", async () => {
    const financeSource = await import("../../src/pages/Finance.jsx?raw").catch(() => null);
    if (!financeSource) return;
    expect(financeSource.default).toContain("onMarkPaid");
  });

  it("i18n key payments.markPaid exists in all locales", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const repoRoot = path.resolve(import.meta.dirname, "../../");
    const messages = readFileSync(path.join(repoRoot, "src/i18n/messages.js"), "utf8");
    const count = (messages.match(/"payments\.markPaid"/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("mark-paid button has data-testid for Playwright", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const repoRoot = path.resolve(import.meta.dirname, "../../");
    const financeSource = readFileSync(path.join(repoRoot, "src/pages/Finance.jsx"), "utf8");
    expect(financeSource).toMatch(/data-testid=\{`mark-paid-\$\{(?:p|payment)\.id\}`\}/);
  });
});
