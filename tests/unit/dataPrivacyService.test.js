import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: { rpc, from, auth: { getUser } },
}));

const {
  listMyDataDeletionRequests,
  listProcessingLog,
  processDataDeletionRequest,
  requestStatusLabel,
  submitDataDeletionRequest,
  submitDataExportRequest,
  updateDataDeletionRequest,
} = await import("../../src/services/dataPrivacyService.js");

function chainResult(result, resolveOn = "limit") {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => (resolveOn === "order" ? Promise.resolve(result) : chain)),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

describe("dataPrivacyService", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("submits deletion requests through the controlled RPC", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "req-1", status: "submitted" }, error: null });

    const row = await submitDataDeletionRequest({
      accountId: "account-1",
      requestType: "user_account_deletion",
      scope: "user",
      targetUserId: "user-1",
      reason: "Leaving",
      requesterNotes: "Please delete",
    });

    expect(row).toEqual({ id: "req-1", status: "submitted" });
    expect(rpc).toHaveBeenCalledWith("submit_data_deletion_request", {
      p_account_id: "account-1",
      p_request_type: "user_account_deletion",
      p_scope: "user",
      p_target_user_id: "user-1",
      p_target_tenant_id: null,
      p_target_contractor_id: null,
      p_reason: "Leaving",
      p_requester_notes: "Please delete",
    });
  });

  it("submits export requests through the export RPC", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "export-1", status: "requested" }, error: null });

    await expect(submitDataExportRequest({ accountId: "account-1", exportType: "account" }))
      .resolves.toMatchObject({ id: "export-1" });

    expect(rpc).toHaveBeenCalledWith("submit_data_export_request", {
      p_account_id: "account-1",
      p_export_type: "account",
    });
  });

  it("uses admin RPCs for review and processing actions", async () => {
    rpc
      .mockResolvedValueOnce({ data: { id: "req-1", status: "approved" }, error: null })
      .mockResolvedValueOnce({ data: { id: "req-1", status: "completed" }, error: null });

    await updateDataDeletionRequest({
      requestId: "req-1",
      status: "approved",
      adminNotes: "Verified",
      rejectedReason: "",
      scheduledFor: null,
    });
    await processDataDeletionRequest("req-1");

    expect(rpc).toHaveBeenNthCalledWith(1, "admin_update_data_deletion_request", {
      p_request_id: "req-1",
      p_status: "approved",
      p_admin_notes: "Verified",
      p_rejected_reason: "",
      p_scheduled_for: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "process_data_deletion_request", {
      p_request_id: "req-1",
    });
  });

  it("lists request and processing status through RLS-protected table reads", async () => {
    const requestChain = chainResult({ data: [{ id: "req-1" }], error: null });
    const logChain = chainResult({ data: [{ id: "log-1" }], error: null }, "order");
    from.mockReturnValueOnce(requestChain).mockReturnValueOnce(logChain);

    await expect(listMyDataDeletionRequests()).resolves.toEqual([{ id: "req-1" }]);
    await expect(listProcessingLog("req-1")).resolves.toEqual([{ id: "log-1" }]);

    expect(from).toHaveBeenNthCalledWith(1, "data_deletion_requests");
    expect(from).toHaveBeenNthCalledWith(2, "data_deletion_processing_log");
    expect(logChain.eq).toHaveBeenCalledWith("request_id", "req-1");
  });

  it("surfaces Supabase errors as readable exceptions", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Access denied" } });

    await expect(submitDataExportRequest({ exportType: "account" })).rejects.toThrow("Access denied");
  });

  it("formats status labels for request tables", () => {
    expect(requestStatusLabel("pending_retention_review")).toBe("Pending Retention Review");
    expect(requestStatusLabel()).toBe("Submitted");
  });
});
