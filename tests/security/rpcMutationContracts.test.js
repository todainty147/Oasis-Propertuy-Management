import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const storageUploadMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    storage: {
      from: vi.fn(() => ({
        upload: (...args) => storageUploadMock(...args),
      })),
    },
  },
}));

describe("RPC mutation contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    storageUploadMock.mockReset();
  });

  it("returns parsed payment mutation rows", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            payment_id: "pay-tenant-1",
            property_id: "property-1",
            amount: "1200",
            status: "OVERDUE",
            due_date: "2026-03-24",
            paid_at: null,
            created_at: "2026-03-24T10:00:00Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "pay-1",
          account_id: "account-1",
          property_id: "property-1",
          tenant_id: "tenant-1",
          amount: "1200",
          due_date: "2026-03-24",
          paid_at: null,
          status: "PENDING",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "pay-1",
          account_id: "account-1",
          property_id: "property-1",
          tenant_id: "tenant-1",
          amount: "1200",
          due_date: "2026-03-24",
          paid_at: "2026-03-25",
          status: "PAID",
        },
        error: null,
      });

    const { createPayment, fetchMyPayments, markPaymentPaid } = await import(
      "../../src/services/paymentService.js"
    );

    const myPayments = await fetchMyPayments("account-1");
    const created = await createPayment({
      accountId: "account-1",
      propertyId: "property-1",
      tenantId: "tenant-1",
      amount: 1200,
      dueDate: "2026-03-24",
    });
    const paid = await markPaymentPaid("pay-1", "2026-03-25", "account-1");

    expect(myPayments[0]).toEqual({
      payment_id: "pay-tenant-1",
      property_id: "property-1",
      amount: 1200,
      status: "overdue",
      due_date: "2026-03-24",
      paid_at: null,
      created_at: "2026-03-24T10:00:00Z",
    });
    expect(created.status).toBe("pending");
    expect(paid.status).toBe("paid");
    expect(rpcMock).toHaveBeenLastCalledWith("mark_payment_paid", {
      p_account_id: "account-1",
      p_payment_id: "pay-1",
      p_paid_at: "2026-03-25",
    });
  });

  it("returns parsed document rows from document RPC writes", async () => {
    storageUploadMock.mockResolvedValueOnce({ error: null });
    rpcMock
      .mockResolvedValueOnce({
        data: {
          id: "doc-1",
          account_id: "account-1",
          property_id: null,
          tenant_id: "tenant-1",
          scope: "tenant",
          visibility: "tenant",
          name: "lease.pdf",
          original_filename: "",
          mime_type: "application/pdf",
          size_bytes: "123",
          storage_path: "account/account-1/documents/doc-1/lease.pdf",
          upload_status: "pending",
          tags: ["agreement"],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "doc-1",
          account_id: "account-1",
          property_id: null,
          tenant_id: "tenant-1",
          scope: "tenant",
          visibility: "tenant",
          name: "lease.pdf",
          original_filename: "lease.pdf",
          mime_type: "application/pdf",
          size_bytes: "123",
          storage_path: "account/account-1/documents/doc-1/lease.pdf",
          upload_status: "uploaded",
          tags: ["agreement"],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "doc-1",
          account_id: "account-1",
          property_id: null,
          tenant_id: "tenant-1",
          scope: "tenant",
          visibility: "tenant",
          name: "lease.pdf",
          original_filename: "lease.pdf",
          mime_type: "application/pdf",
          size_bytes: "123",
          storage_path: "account/account-1/documents/doc-1/lease.pdf",
          upload_status: "uploaded",
          tags: ["agreement", "id"],
        },
        error: null,
      });

    const file = new File(["test"], "lease.pdf", { type: "application/pdf" });

    const { updateDocumentTags, uploadDocument } = await import("../../src/services/documentService.js");
    const uploaded = await uploadDocument({
      file,
      accountId: "account-1",
      tenantId: "tenant-1",
      tags: ["agreement"],
    });
    const updated = await updateDocumentTags({
      documentId: "doc-1",
      tags: ["agreement", "id"],
    });

    expect(uploaded.upload_status).toBe("uploaded");
    expect(uploaded.visibility).toBe("tenant");
    expect(updated.tags).toEqual(["agreement", "id"]);
  });

  it("logs safe document storage operation correlation when upload fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const uploadError = {
      message: "Access denied",
      name: "StorageApiError",
      error: "AccessDenied",
      statusCode: 403,
      response: {
        headers: {
          get(name) {
            const lower = String(name).toLowerCase();
            if (lower === "x-request-id") return "storage-req-1";
            return null;
          },
        },
      },
    };

    rpcMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockResolvedValueOnce({
      data: {
        id: "doc-1",
        account_id: "account-1",
        property_id: null,
        tenant_id: "tenant-1",
        scope: "tenant",
        visibility: "tenant",
        name: "lease.pdf",
        original_filename: "",
        mime_type: "application/pdf",
        size_bytes: "123",
        storage_path: "account/account-1/documents/doc-1/lease.pdf",
        upload_status: "pending",
        tags: ["agreement"],
      },
      error: null,
    });
    storageUploadMock.mockResolvedValueOnce({ error: uploadError });

    const file = new File(["test"], "lease.pdf", { type: "application/pdf" });
    const { uploadDocument } = await import("../../src/services/documentService.js");

    await expect(uploadDocument({
      file,
      accountId: "account-1",
      tenantId: "tenant-1",
      tags: ["agreement"],
    })).rejects.toThrow("Access denied");

    const [, payload] = spy.mock.calls[0];
    expect(payload.context.accountId).toBe("account-1");
    expect(payload.context.documentId).toBe("doc-1");
    expect(payload.context.storageBucket).toBe("documents");
    expect(payload.context.storageProvider).toBe("supabase_storage");
    expect(payload.context.storageOperationId).toMatch(/^document_storage_upload-/);
    expect(payload.context.providerStatus).toBe(403);
    expect(payload.context.providerRequestId).toBe("storage-req-1");
    expect(payload.context.storagePath).toBeUndefined();
    expect(payload.context.filename).toBeUndefined();

    spy.mockRestore();
  });

  it("returns parsed work-order financial and preventive mutation rows", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          id: "wof-1",
          account_id: "account-1",
          work_order_id: "wo-1",
          quote_amount: "500",
          quote_currency: "GBP",
          quote_notes: "draft",
          quote_status: "DRAFT",
          invoice_amount: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "task-1",
          account_id: "account-1",
          property_id: "property-1",
          title: "Boiler check",
          category: "safety",
          frequency: "MONTHLY",
          frequency_interval_days: null,
          next_due_date: "2026-04-24",
          last_completed_at: "2026-03-24T10:00:00Z",
          assigned_to_contractor_id: null,
          notes: "",
          status: "ACTIVE",
          property: { address: "11 Starlight Avenue" },
          assigned_contractor: null,
        },
        error: null,
      });

    const { upsertQuoteDraft } = await import("../../src/services/workOrderFinancialsService.js");
    const { completePreventiveMaintenanceTask } = await import(
      "../../src/services/preventiveMaintenanceService.js"
    );

    const financial = await upsertQuoteDraft({
      workOrderId: "wo-1",
      quoteAmount: 500,
      quoteCurrency: "GBP",
      quoteNotes: "draft",
    });
    const task = await completePreventiveMaintenanceTask("account-1", "task-1", {
      completedAt: "2026-03-24T10:00:00Z",
    });

    expect(financial.quote_amount).toBe(500);
    expect(financial.quote_status).toBe("draft");
    expect(task.frequency).toBe("monthly");
    expect(task.propertyLabel).toBe("11 Starlight Avenue");
    expect(rpcMock).toHaveBeenLastCalledWith("complete_preventive_maintenance_task", {
      p_account_id: "account-1",
      p_task_id: "task-1",
      p_completed_at: "2026-03-24T10:00:00Z",
    });
  });
});
