import { vi, describe, expect, it, beforeEach } from "vitest";

const mockRpc = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: { rpc: (...args) => mockRpc(...args) },
}));

const svc = await import("../../src/services/provenanceDocumentService.js");

beforeEach(() => {
  mockRpc.mockReset();
});

describe("provenanceDocumentService", () => {
  describe("getDocumentServiceTimeline", () => {
    it("calls get_document_service_timeline RPC", async () => {
      mockRpc.mockResolvedValue({ data: { events: [] }, error: null });
      const result = await svc.getDocumentServiceTimeline("doc-1");
      expect(mockRpc).toHaveBeenCalledWith("get_document_service_timeline", {
        p_document_id: "doc-1",
      });
      expect(result).toEqual({ events: [] });
    });

    it("throws on error", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "fail" } });
      await expect(svc.getDocumentServiceTimeline("doc-1")).rejects.toEqual({
        message: "fail",
      });
    });
  });

  describe("getDocumentServiceProjection", () => {
    it("calls document_service_projection RPC", async () => {
      mockRpc.mockResolvedValue({ data: { status: "uploaded" }, error: null });
      const result = await svc.getDocumentServiceProjection("doc-1");
      expect(mockRpc).toHaveBeenCalledWith("document_service_projection", {
        p_document_id: "doc-1",
      });
      expect(result).toEqual({ status: "uploaded" });
    });
  });

  describe("recordDocumentUploaded", () => {
    it("calls record_document_uploaded RPC", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentUploaded("doc-1");
      expect(mockRpc).toHaveBeenCalledWith("record_document_uploaded", {
        p_document_id: "doc-1",
      });
    });
  });

  describe("recordDocumentServedAsserted", () => {
    it("calls record_document_served_asserted with all parameters", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentServedAsserted("doc-1", {
        serviceMethod: "post",
        recipient: "John Doe",
        assertedServiceDate: "2026-06-01",
        assertionNote: "left with neighbour",
        supportingEvidenceReference: "photo-123",
      });
      expect(mockRpc).toHaveBeenCalledWith("record_document_served_asserted", {
        p_document_id: "doc-1",
        p_service_method: "post",
        p_recipient: "John Doe",
        p_asserted_service_date: "2026-06-01",
        p_assertion_note: "left with neighbour",
        p_supporting_evidence_reference: "photo-123",
      });
    });

    it("defaults optional params to null", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentServedAsserted("doc-1", {
        serviceMethod: "hand",
        recipient: "Jane",
        assertedServiceDate: "2026-06-01",
      });
      expect(mockRpc).toHaveBeenCalledWith("record_document_served_asserted", {
        p_document_id: "doc-1",
        p_service_method: "hand",
        p_recipient: "Jane",
        p_asserted_service_date: "2026-06-01",
        p_assertion_note: null,
        p_supporting_evidence_reference: null,
      });
    });
  });

  describe("service_role-only functions are not exported", () => {
    it("does not export recordDocumentServedSystem", () => {
      expect(svc.recordDocumentServedSystem).toBeUndefined();
    });

    it("does not export recordDocumentDeliveryConfirmed", () => {
      expect(svc.recordDocumentDeliveryConfirmed).toBeUndefined();
    });

    it("does not export recordDocumentServiceFailed", () => {
      expect(svc.recordDocumentServiceFailed).toBeUndefined();
    });

    it("does not export recordDocumentViewed", () => {
      expect(svc.recordDocumentViewed).toBeUndefined();
    });

    it("does not export recordDocumentDownloaded", () => {
      expect(svc.recordDocumentDownloaded).toBeUndefined();
    });
  });

  describe("recordDocumentAvailable", () => {
    it("calls record_document_available RPC with all params", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentAvailable("doc-1", {
        tenantUserId: "user-t",
        accessGrantId: "ag-1",
        accessChannel: "portal",
        availableFrom: "2026-06-01",
        availableUntil: "2026-07-01",
      });
      expect(mockRpc).toHaveBeenCalledWith("record_document_available", {
        p_document_id: "doc-1",
        p_tenant_user_id: "user-t",
        p_access_grant_id: "ag-1",
        p_access_channel: "portal",
        p_available_from: "2026-06-01",
        p_available_until: "2026-07-01",
      });
    });
  });

  describe("recordDocumentAcknowledged", () => {
    it("calls record_document_acknowledged RPC with all params", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentAcknowledged("doc-1", {
        acknowledgementText: "I confirm receipt",
        acknowledgementTextVersion: "v1.0",
        acknowledgementMethod: "click",
        locale: "en",
        accessGrantId: "ag-1",
        submissionNonce: "nonce-abc",
      });
      expect(mockRpc).toHaveBeenCalledWith("record_document_acknowledged", {
        p_document_id: "doc-1",
        p_acknowledgement_text: "I confirm receipt",
        p_acknowledgement_text_version: "v1.0",
        p_acknowledgement_method: "click",
        p_locale: "en",
        p_access_grant_id: "ag-1",
        p_submission_nonce: "nonce-abc",
      });
    });

    it("defaults optional params", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentAcknowledged("doc-1", {
        acknowledgementText: "I confirm",
        acknowledgementTextVersion: "v1",
      });
      expect(mockRpc).toHaveBeenCalledWith("record_document_acknowledged", {
        p_document_id: "doc-1",
        p_acknowledgement_text: "I confirm",
        p_acknowledgement_text_version: "v1",
        p_acknowledgement_method: "click",
        p_locale: "en",
        p_access_grant_id: null,
        p_submission_nonce: null,
      });
    });
  });

  describe("recordDocumentExpired", () => {
    it("calls record_document_expired RPC", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentExpired("doc-1", "superseded");
      expect(mockRpc).toHaveBeenCalledWith("record_document_expired", {
        p_document_id: "doc-1",
        p_reason: "superseded",
      });
    });

    it("defaults reason to null", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentExpired("doc-1");
      expect(mockRpc).toHaveBeenCalledWith("record_document_expired", {
        p_document_id: "doc-1",
        p_reason: null,
      });
    });
  });

  describe("recordDocumentReplaced", () => {
    it("calls record_document_replaced RPC", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentReplaced("doc-1", "doc-2");
      expect(mockRpc).toHaveBeenCalledWith("record_document_replaced", {
        p_document_id: "doc-1",
        p_replacement_document_id: "doc-2",
      });
    });
  });

  describe("recordDocumentWithdrawn", () => {
    it("calls record_document_withdrawn RPC", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentWithdrawn("doc-1", "error in document");
      expect(mockRpc).toHaveBeenCalledWith("record_document_withdrawn", {
        p_document_id: "doc-1",
        p_reason: "error in document",
      });
    });

    it("defaults reason to null", async () => {
      mockRpc.mockResolvedValue({ data: "ok", error: null });
      await svc.recordDocumentWithdrawn("doc-1");
      expect(mockRpc).toHaveBeenCalledWith("record_document_withdrawn", {
        p_document_id: "doc-1",
        p_reason: null,
      });
    });
  });
});
