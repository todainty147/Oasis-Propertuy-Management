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

function makeFinancialRow(overrides = {}) {
  return {
    id: "fin-1",
    account_id: "account-1",
    work_order_id: "wo-1",
    quote_amount: 250,
    quote_currency: "GBP",
    quote_notes: "test notes",
    quote_status: "approved",
    quote_submitted_at: "2026-04-01T10:00:00Z",
    quote_submitted_by: "user-contractor",
    approved_at: "2026-04-02T09:00:00Z",
    approved_by: "user-owner",
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    invoice_amount: null,
    invoice_currency: "GBP",
    invoice_issued_at: null,
    invoice_due_at: null,
    created_at: "2026-04-01T08:00:00Z",
    updated_at: "2026-04-02T09:00:00Z",
    ...overrides,
  };
}

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    single: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };
  return query;
}

describe("workOrderFinancialsService contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    createNotificationsMock.mockReset();
    createNotificationsMock.mockResolvedValue({ ok: true });
  });

  describe("getWorkOrderFinancials", () => {
    it("requires accountId", async () => {
      const { getWorkOrderFinancials } = await import("../../src/services/workOrderFinancialsService.js");
      await expect(getWorkOrderFinancials({ workOrderId: "wo-1" })).rejects.toThrow();
    });

    it("requires workOrderId", async () => {
      const { getWorkOrderFinancials } = await import("../../src/services/workOrderFinancialsService.js");
      await expect(getWorkOrderFinancials({ accountId: "account-1" })).rejects.toThrow();
    });

    it("scopes the query to both account_id and work_order_id", async () => {
      const query = createThenableQuery({ data: null, error: null });
      fromMock.mockReturnValue(query);

      const { getWorkOrderFinancials } = await import("../../src/services/workOrderFinancialsService.js");
      await getWorkOrderFinancials({ accountId: "account-1", workOrderId: "wo-1" });

      expect(query.eq).toHaveBeenCalledWith("account_id", "account-1");
      expect(query.eq).toHaveBeenCalledWith("work_order_id", "wo-1");
    });

    it("returns null when no row found", async () => {
      const query = createThenableQuery({ data: null, error: null });
      fromMock.mockReturnValue(query);

      const { getWorkOrderFinancials } = await import("../../src/services/workOrderFinancialsService.js");
      const result = await getWorkOrderFinancials({ accountId: "account-1", workOrderId: "wo-1" });
      expect(result).toBeNull();
    });
  });

  describe("approveQuote", () => {
    it("calls wo_fin_approve_quote RPC with the work order id", async () => {
      rpcMock
        .mockResolvedValueOnce({ data: makeFinancialRow(), error: null })
        .mockResolvedValue({ data: null, error: null });
      fromMock.mockReturnValue(createThenableQuery({ data: { contractor_user_id: "contractor-1" }, error: null }));

      const { approveQuote } = await import("../../src/services/workOrderFinancialsService.js");
      await approveQuote({ workOrderId: "wo-1" });

      expect(rpcMock).toHaveBeenCalledWith("wo_fin_approve_quote", { p_work_order_id: "wo-1" });
    });

    it("fires a quote_decision notification after successful approval", async () => {
      rpcMock
        .mockResolvedValueOnce({ data: makeFinancialRow(), error: null })
        .mockResolvedValue({ data: null, error: null });
      fromMock.mockReturnValue(
        createThenableQuery({ data: { contractor_user_id: "contractor-user-1" }, error: null })
      );

      const { approveQuote } = await import("../../src/services/workOrderFinancialsService.js");
      await approveQuote({ workOrderId: "wo-1" });

      expect(createNotificationsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "quote_decision",
          recipientUserIds: ["contractor-user-1"],
          linkPath: "/contractor/jobs/wo-1",
        })
      );
    });

    it("requires workOrderId", async () => {
      const { approveQuote } = await import("../../src/services/workOrderFinancialsService.js");
      await expect(approveQuote({})).rejects.toThrow();
    });

    it("does not throw if notification fails", async () => {
      rpcMock.mockResolvedValueOnce({ data: makeFinancialRow(), error: null });
      fromMock.mockReturnValue(createThenableQuery({ data: null, error: { message: "db error" } }));
      createNotificationsMock.mockRejectedValue(new Error("notify fail"));

      const { approveQuote } = await import("../../src/services/workOrderFinancialsService.js");
      await expect(approveQuote({ workOrderId: "wo-1" })).resolves.toBeDefined();
    });
  });

  describe("rejectQuote", () => {
    it("calls wo_fin_reject_quote RPC with work order id and reason", async () => {
      rpcMock
        .mockResolvedValueOnce({ data: makeFinancialRow({ quote_status: "rejected", rejected_at: "2026-04-03T10:00:00Z", rejection_reason: "Too expensive" }), error: null })
        .mockResolvedValue({ data: null, error: null });
      fromMock.mockReturnValue(createThenableQuery({ data: { contractor_user_id: "contractor-1" }, error: null }));

      const { rejectQuote } = await import("../../src/services/workOrderFinancialsService.js");
      await rejectQuote({ workOrderId: "wo-1", reason: "Too expensive" });

      expect(rpcMock).toHaveBeenCalledWith("wo_fin_reject_quote", {
        p_work_order_id: "wo-1",
        p_reason: "Too expensive",
      });
    });

    it("fires a quote_decision notification with rejected outcome", async () => {
      rpcMock
        .mockResolvedValueOnce({ data: makeFinancialRow({ quote_status: "rejected" }), error: null })
        .mockResolvedValue({ data: null, error: null });
      fromMock.mockReturnValue(createThenableQuery({ data: { contractor_user_id: "contractor-1" }, error: null }));

      const { rejectQuote } = await import("../../src/services/workOrderFinancialsService.js");
      await rejectQuote({ workOrderId: "wo-1", reason: "Too costly" });

      expect(createNotificationsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "quote_decision",
          metadata: expect.objectContaining({ outcome: "rejected" }),
        })
      );
    });
  });

  describe("approveInvoice", () => {
    it("calls wo_fin_approve_invoice RPC", async () => {
      rpcMock.mockResolvedValueOnce({
        data: makeFinancialRow({ invoice_amount: 300, approved_at: "2026-04-10T10:00:00Z" }),
        error: null,
      });

      const { approveInvoice } = await import("../../src/services/workOrderFinancialsService.js");
      await approveInvoice({ workOrderId: "wo-1" });

      expect(rpcMock).toHaveBeenCalledWith("wo_fin_approve_invoice", { p_work_order_id: "wo-1" });
    });

    it("requires workOrderId", async () => {
      const { approveInvoice } = await import("../../src/services/workOrderFinancialsService.js");
      await expect(approveInvoice({})).rejects.toThrow();
    });
  });

  describe("rejectInvoice", () => {
    it("calls wo_fin_reject_invoice RPC with reason", async () => {
      rpcMock.mockResolvedValueOnce({
        data: makeFinancialRow({ invoice_amount: 300, rejected_at: "2026-04-10T10:00:00Z", rejection_reason: "Incorrect amount" }),
        error: null,
      });

      const { rejectInvoice } = await import("../../src/services/workOrderFinancialsService.js");
      await rejectInvoice({ workOrderId: "wo-1", reason: "Incorrect amount" });

      expect(rpcMock).toHaveBeenCalledWith("wo_fin_reject_invoice", {
        p_work_order_id: "wo-1",
        p_reason: "Incorrect amount",
      });
    });

    it("requires a non-empty reason", async () => {
      const { rejectInvoice } = await import("../../src/services/workOrderFinancialsService.js");
      await expect(rejectInvoice({ workOrderId: "wo-1", reason: "" })).rejects.toThrow();
    });
  });
});
