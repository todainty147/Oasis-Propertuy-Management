import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  storageUpload: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  logSecurityRelevantFailure: vi.fn(),
  logOperationalLatencySample: vi.fn(),
  logSlowOperationalTelemetry: vi.fn(),
}));

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => mocks.rpc(...args),
    storage: {
      from: (...args) => mocks.storageFrom(...args),
    },
  },
}));

vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: (...args) => mocks.logSecurityRelevantFailure(...args),
  logOperationalLatencySample: (...args) => mocks.logOperationalLatencySample(...args),
  logSlowOperationalTelemetry: (...args) => mocks.logSlowOperationalTelemetry(...args),
  startOperationalTimer: () => 0,
}));

function storageClient() {
  return {
    upload: (...args) => mocks.storageUpload(...args),
    createSignedUrl: (...args) => mocks.storageCreateSignedUrl(...args),
  };
}

describe("fault injection and degraded-path contracts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue(storageClient());
    const { clearSnapshotCache } = await import("../../src/services/snapshotCache.js");
    clearSnapshotCache();
  });

  it("returns zeroed critical snapshots when deployed RPCs are missing", async () => {
    const missingRpcError = {
      code: "PGRST404",
      message: "Could not find the function public.finance_snapshot",
    };
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: missingRpcError })
      .mockResolvedValueOnce({ data: null, error: missingRpcError })
      .mockResolvedValueOnce({ data: null, error: missingRpcError })
      .mockResolvedValueOnce({ data: null, error: missingRpcError });

    const { getDashboardSnapshot } = await import("../../src/services/dashboardService.js");
    const { getFinanceSnapshot } = await import("../../src/services/financeService.js");
    const { getPortfolioHealthSnapshot } = await import("../../src/services/portfolioHealthService.js");

    await expect(getDashboardSnapshot("account-1", { forceRefresh: true })).resolves.toMatchObject({
      property_count: 0,
      open_requests: 0,
    });
    await expect(getFinanceSnapshot("account-1", null, { forceRefresh: true })).resolves.toMatchObject({
      total_income: 0,
      outstanding_income: 0,
      property_finance: [],
    });
    await expect(getPortfolioHealthSnapshot("account-1", null, { forceRefresh: true })).resolves.toMatchObject({
      property_count: 0,
      outstanding_amount: 0,
    });

    expect(mocks.logSecurityRelevantFailure).not.toHaveBeenCalled();
  });

  it("logs and surfaces RPC timeout failures instead of falling back silently", async () => {
    const timeoutError = {
      code: "57014",
      message: "canceling statement due to statement timeout",
    };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: timeoutError });

    const { getFinanceSnapshot } = await import("../../src/services/financeService.js");

    await expect(getFinanceSnapshot("account-1", null, { forceRefresh: true })).rejects.toThrow(
      "canceling statement due to statement timeout",
    );
    expect(mocks.logSecurityRelevantFailure).toHaveBeenCalledWith("finance_snapshot", {
      error: timeoutError,
      context: {
        accountId: "account-1",
        tenantId: null,
      },
    });
  });

  it("logs notification write failures with account and recipient scope", async () => {
    const notificationError = {
      code: "P0001",
      message: "notification insert failed",
    };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: notificationError });

    const { createNotifications } = await import("../../src/services/notificationService.js");

    await expect(
      createNotifications({
        accountId: "account-1",
        recipientUserIds: ["user-1", "user-2"],
        type: "document_uploaded",
        title: "Document uploaded",
        entityType: "document",
        entityId: "doc-1",
      }),
    ).rejects.toBe(notificationError);

    expect(mocks.logSecurityRelevantFailure).toHaveBeenCalledWith("create_notifications", {
      error: notificationError,
      context: {
        accountId: "account-1",
        type: "document_uploaded",
        entityType: "document",
        entityId: "doc-1",
        recipientCount: 2,
      },
    });
  });

  it("logs storage upload failures after document stub creation without finalizing the document", async () => {
    const uploadError = {
      message: "Storage write failed",
      name: "StorageApiError",
      statusCode: 500,
    };
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: "doc-1",
        storage_path: "account/account-1/documents/sensitive.pdf",
      },
      error: null,
    });
    mocks.storageUpload.mockResolvedValueOnce({ data: null, error: uploadError });

    const { uploadDocument } = await import("../../src/services/documentService.js");

    await expect(
      uploadDocument({
        accountId: "account-1",
        propertyId: "11111111-1111-1111-1111-111111111111",
        file: {
          name: "sensitive.pdf",
          type: "application/pdf",
          size: 256,
        },
      }),
    ).rejects.toThrow("Storage write failed");

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.storageFrom).toHaveBeenCalledWith("documents");
    expect(mocks.storageUpload).toHaveBeenCalledWith(
      "account/account-1/documents/sensitive.pdf",
      expect.objectContaining({ name: "sensitive.pdf" }),
      expect.objectContaining({ upsert: false, contentType: "application/pdf" }),
    );
    expect(mocks.logSecurityRelevantFailure).toHaveBeenCalledWith("document_storage_upload", {
      error: uploadError,
      context: expect.objectContaining({
        accountId: "account-1",
        documentId: "doc-1",
        propertyId: "11111111-1111-1111-1111-111111111111",
        operation: "storage_upload",
        storageBucket: "documents",
        storageProvider: "supabase_storage",
      }),
    });
  });

  it("logs signed-url storage failures with safe document context", async () => {
    const signedUrlError = {
      message: "Storage signing failed",
      name: "StorageApiError",
      statusCode: 403,
    };
    mocks.storageCreateSignedUrl.mockResolvedValueOnce({ data: null, error: signedUrlError });

    const { getDocumentPreviewUrl } = await import("../../src/services/documentService.js");

    await expect(
      getDocumentPreviewUrl("account/account-1/documents/sensitive.pdf", {
        accountId: "account-1",
        documentId: "doc-1",
        visibility: "staff",
      }),
    ).rejects.toBe(signedUrlError);

    expect(mocks.storageFrom).toHaveBeenCalledWith("documents");
    expect(mocks.storageCreateSignedUrl).toHaveBeenCalledWith(
      "account/account-1/documents/sensitive.pdf",
      600,
    );
    expect(mocks.logSecurityRelevantFailure).toHaveBeenCalledWith("document_preview_url", {
      error: signedUrlError,
      context: expect.objectContaining({
        accountId: "account-1",
        documentId: "doc-1",
        visibility: "staff",
        operation: "create_preview_url",
        storageBucket: "documents",
        storageProvider: "supabase_storage",
      }),
    });
  });

  it("normalizes edge function failure payloads for downstream observability", async () => {
    const { buildEdgeFunctionFailure } = await import("../../src/services/edgeFunctionFailure.js");

    const error = buildEdgeFunctionFailure({
      status: 503,
      surface: "send-reminder-emails",
      fallback: "Reminder provider failed",
      accountId: "account-1",
      entityType: "notification",
      entityId: "notification-1",
      payload: {
        error: "Provider unavailable",
        classification: {
          reason: "resend_unavailable",
          correlationId: "corr-1",
        },
      },
    });

    expect(error.message).toBe("Provider unavailable");
    expect(error.code).toBe("503");
    expect(JSON.parse(error.details)).toEqual({
      event: "send-reminder-emails",
      reason: "resend_unavailable",
      account_id: "account-1",
      entity_type: "notification",
      entity_id: "notification-1",
      correlation_id: "corr-1",
    });
  });
});
