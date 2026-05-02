import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────────────────────

const rpcMock  = vi.fn();
const fromMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc:  (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

function createQuery(result) {
  const q = {
    select:   vi.fn(() => q),
    eq:       vi.fn(() => q),
    order:    vi.fn(() => q),
    limit:    vi.fn(() => q),
    upsert:   vi.fn(() => q),
    insert:   vi.fn(() => q),
    update:   vi.fn(() => q),
    single:   vi.fn(() => Promise.resolve(result)),
    then:     (res, rej) => Promise.resolve(result).then(res, rej),
    catch:    (rej) => Promise.resolve(result).catch(rej),
  };
  return q;
}

function rpcQuery(result) {
  const q = {
    single: vi.fn(() => Promise.resolve(result)),
    then:   (res, rej) => Promise.resolve(result).then(res, rej),
    catch:  (rej) => Promise.resolve(result).catch(rej),
  };
  return q;
}

// ── Service under test ────────────────────────────────────────────────────────

describe("documentExtractionService: module shape", () => {
  it("exports requestDocumentExtraction", async () => {
    const svc = await import("../../src/services/documentExtractionService.js");
    expect(typeof svc.requestDocumentExtraction).toBe("function");
  });

  it("exports getDocumentExtraction", async () => {
    const svc = await import("../../src/services/documentExtractionService.js");
    expect(typeof svc.getDocumentExtraction).toBe("function");
  });

  it("exports listDocumentExtractions", async () => {
    const svc = await import("../../src/services/documentExtractionService.js");
    expect(typeof svc.listDocumentExtractions).toBe("function");
  });

  it("exports listDocumentExtractionRuns", async () => {
    const svc = await import("../../src/services/documentExtractionService.js");
    expect(typeof svc.listDocumentExtractionRuns).toBe("function");
  });

  it("exports markDocumentExtractionStale", async () => {
    const svc = await import("../../src/services/documentExtractionService.js");
    expect(typeof svc.markDocumentExtractionStale).toBe("function");
  });

  it("exports getBestDocumentExtractionForAudit", async () => {
    const svc = await import("../../src/services/documentExtractionService.js");
    expect(typeof svc.getBestDocumentExtractionForAudit).toBe("function");
  });
});

// ── requestDocumentExtraction ─────────────────────────────────────────────────

describe("requestDocumentExtraction", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("calls request_document_extraction RPC with correct params", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({
        data: {
          id: "run-1",
          account_id: "acc-1",
          document_id: "doc-1",
          extractor: "auto",
          status: "queued",
          metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
        error: null,
      })
    );

    const { requestDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await requestDocumentExtraction("acc-1", "doc-1", { extractor: "auto" });

    expect(rpcMock).toHaveBeenCalledWith("request_document_extraction", expect.objectContaining({
      p_account_id:  "acc-1",
      p_document_id: "doc-1",
      p_extractor:   "auto",
    }));
    expect(result.status).toBe("queued");
    expect(result.document_id).toBe("doc-1");
  });

  it("throws if accountId is missing", async () => {
    const { requestDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    await expect(requestDocumentExtraction(null, "doc-1")).rejects.toThrow("Missing accountId");
  });

  it("throws if documentId is missing", async () => {
    const { requestDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    await expect(requestDocumentExtraction("acc-1", null)).rejects.toThrow("Missing documentId");
  });

  it("propagates RPC errors", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({ data: null, error: { message: "Permission denied", code: "42501" } })
    );

    const { requestDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    await expect(requestDocumentExtraction("acc-1", "doc-1")).rejects.toThrow();
  });
});

// ── getDocumentExtraction ─────────────────────────────────────────────────────

describe("getDocumentExtraction", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns null when no extraction exists", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({ data: [], error: null })
    );

    const { getDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await getDocumentExtraction("acc-1", "doc-1");
    expect(result).toBeNull();
  });

  it("returns null for missing accountId", async () => {
    const { getDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await getDocumentExtraction(null, "doc-1");
    expect(result).toBeNull();
  });

  it("returns parsed extraction row when found", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({
        data: [{
          id:                 "ext-1",
          account_id:         "acc-1",
          document_id:        "doc-1",
          extractor:          "native_pdf",
          status:             "completed",
          text_content:       "Lease agreement text...",
          confidence_score:   "0.9200",
          source_hash:        "abc123",
          character_count:    23,
          page_count:         2,
          structured_payload: { quality_flag: "good" },
          created_at:         "2026-01-01T00:00:00Z",
          updated_at:         "2026-01-01T00:00:00Z",
        }],
        error: null,
      })
    );

    const { getDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await getDocumentExtraction("acc-1", "doc-1");

    expect(result).not.toBeNull();
    expect(result.id).toBe("ext-1");
    expect(result.status).toBe("completed");
    expect(result.extractor).toBe("native_pdf");
    expect(result.confidence_score).toBe(0.92);
    expect(result.text_content).toBe("Lease agreement text...");
  });

  it("falls back to direct table access on PGRST202", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({ data: null, error: { code: "PGRST202", message: "Function not found" } })
    );

    const directQuery = createQuery({ data: [], error: null });
    fromMock.mockReturnValue(directQuery);

    const { getDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await getDocumentExtraction("acc-1", "doc-1");

    expect(fromMock).toHaveBeenCalledWith("document_extractions");
    expect(result).toBeNull();
  });

  it("returns null for missing table (PGRST404)", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({ data: null, error: { code: "PGRST404", message: "relation does not exist" } })
    );

    const { getDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await getDocumentExtraction("acc-1", "doc-1");
    expect(result).toBeNull();
  });
});

// ── listDocumentExtractions ───────────────────────────────────────────────────

describe("listDocumentExtractions", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns empty array when no accountId", async () => {
    const { listDocumentExtractions } = await import("../../src/services/documentExtractionService.js");
    const result = await listDocumentExtractions(null);
    expect(result).toEqual([]);
  });

  it("calls list_document_extractions RPC", async () => {
    rpcMock.mockReturnValue(rpcQuery({ data: [], error: null }));

    const { listDocumentExtractions } = await import("../../src/services/documentExtractionService.js");
    await listDocumentExtractions("acc-1", { status: "completed" });

    expect(rpcMock).toHaveBeenCalledWith("list_document_extractions", expect.objectContaining({
      p_account_id: "acc-1",
      p_status:     "completed",
    }));
  });

  it("falls back to direct table on PGRST202", async () => {
    rpcMock.mockReturnValue(
      rpcQuery({ data: null, error: { code: "PGRST202", message: "Function not found" } })
    );

    const directQuery = createQuery({ data: [], error: null });
    fromMock.mockReturnValue(directQuery);

    const { listDocumentExtractions } = await import("../../src/services/documentExtractionService.js");
    await listDocumentExtractions("acc-1");

    expect(fromMock).toHaveBeenCalledWith("document_extractions");
  });
});

// ── markDocumentExtractionStale ───────────────────────────────────────────────

describe("markDocumentExtractionStale", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls mark_document_extraction_stale RPC", async () => {
    rpcMock.mockReturnValue(rpcQuery({ data: [], error: null }));

    const { markDocumentExtractionStale } = await import("../../src/services/documentExtractionService.js");
    await markDocumentExtractionStale("acc-1", "doc-1");

    expect(rpcMock).toHaveBeenCalledWith("mark_document_extraction_stale", {
      p_account_id:  "acc-1",
      p_document_id: "doc-1",
    });
  });

  it("throws if accountId missing", async () => {
    const { markDocumentExtractionStale } = await import("../../src/services/documentExtractionService.js");
    await expect(markDocumentExtractionStale(null, "doc-1")).rejects.toThrow("Missing accountId");
  });
});

// ── getBestDocumentExtractionForAudit ─────────────────────────────────────────

describe("getBestDocumentExtractionForAudit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns extraction_required when no extraction exists", async () => {
    rpcMock.mockReturnValue(rpcQuery({ data: [], error: null }));

    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit("acc-1", "doc-1");

    expect(result.status).toBe("extraction_required");
    expect(result.extraction).toBeNull();
  });

  it("returns unavailable for missing accountId", async () => {
    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit(null, "doc-1");
    expect(result.status).toBe("unavailable");
  });

  it("returns ready for completed high-quality extraction", async () => {
    rpcMock.mockReturnValue(rpcQuery({
      data: [{
        id: "ext-1", account_id: "acc-1", document_id: "doc-1",
        extractor: "native_pdf", status: "completed",
        text_content: "A".repeat(1000),
        character_count: 1000, confidence_score: "0.9000",
        structured_payload: { quality_flag: "good" },
        source_hash: "abc", created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    }));

    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit("acc-1", "doc-1");

    expect(result.status).toBe("ready");
    expect(result.extraction).not.toBeNull();
  });

  it("returns advanced_extraction_recommended for low confidence", async () => {
    rpcMock.mockReturnValue(rpcQuery({
      data: [{
        id: "ext-2", account_id: "acc-1", document_id: "doc-1",
        extractor: "native_pdf", status: "completed",
        text_content: "Ab",
        character_count: 2, confidence_score: "0.1000",
        structured_payload: {
          quality_flag: "too_short",
          recommended_extractor: "ocrmypdf_tesseract",
        },
        source_hash: "xyz", created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    }));

    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit("acc-1", "doc-1");

    expect(result.status).toBe("advanced_extraction_recommended");
  });

  it("returns extraction_in_progress for queued run", async () => {
    rpcMock.mockReturnValue(rpcQuery({
      data: [{
        id: "ext-3", account_id: "acc-1", document_id: "doc-1",
        extractor: "auto", status: "pending",
        text_content: null, confidence_score: null,
        structured_payload: {}, source_hash: "pending-hash",
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    }));

    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit("acc-1", "doc-1");

    expect(result.status).toBe("extraction_in_progress");
  });

  it("returns extraction_failed when last extraction failed", async () => {
    rpcMock.mockReturnValue(rpcQuery({
      data: [{
        id: "ext-4", account_id: "acc-1", document_id: "doc-1",
        extractor: "native_pdf", status: "failed",
        error_message: "pdf-parse failed: corrupt file",
        text_content: null, confidence_score: null,
        structured_payload: {}, source_hash: "fail-hash",
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    }));

    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit("acc-1", "doc-1");

    expect(result.status).toBe("extraction_failed");
    expect(result.error_message).toContain("corrupt file");
  });

  it("returns stale_extraction for stale extraction", async () => {
    rpcMock.mockReturnValue(rpcQuery({
      data: [{
        id: "ext-5", account_id: "acc-1", document_id: "doc-1",
        extractor: "native_pdf", status: "stale",
        text_content: "old text", confidence_score: "0.9000",
        structured_payload: {}, source_hash: "old-hash",
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    }));

    const { getBestDocumentExtractionForAudit } = await import("../../src/services/documentExtractionService.js");
    const result = await getBestDocumentExtractionForAudit("acc-1", "doc-1");

    expect(result.status).toBe("stale_extraction");
  });
});

// ── rpcContracts: parsers ─────────────────────────────────────────────────────

describe("rpcContracts: parseDocumentExtractionRow", () => {
  it("is exported from rpcContracts", async () => {
    const contracts = await import("../../src/services/rpcContracts.js");
    expect(typeof contracts.parseDocumentExtractionRow).toBe("function");
  });

  it("parses all required fields", async () => {
    const { parseDocumentExtractionRow } = await import("../../src/services/rpcContracts.js");
    const row = parseDocumentExtractionRow({
      id: "ext-1",
      account_id: "acc-1",
      document_id: "doc-1",
      extractor: "NATIVE_PDF",
      status: "COMPLETED",
      text_content: "Hello world",
      confidence_score: "0.9200",
      source_hash: "abc",
      page_count: "3",
      character_count: "11",
      structured_payload: { quality_flag: "good" },
      created_at: "2026-01-01T00:00:00Z",
    });

    expect(row.id).toBe("ext-1");
    expect(row.extractor).toBe("native_pdf");    // lowercased
    expect(row.status).toBe("completed");         // lowercased
    expect(row.confidence_score).toBe(0.92);      // numeric
    expect(row.page_count).toBe(3);               // numeric
    expect(row.character_count).toBe(11);         // numeric
    expect(row.structured_payload.quality_flag).toBe("good");
  });

  it("defaults status to pending", async () => {
    const { parseDocumentExtractionRow } = await import("../../src/services/rpcContracts.js");
    const row = parseDocumentExtractionRow({
      id: "ext-1", account_id: "acc-1", document_id: "doc-1",
      extractor: "auto", source_hash: "abc",
    });
    expect(row.status).toBe("pending");
  });
});

describe("rpcContracts: parseDocumentExtractionRunRow", () => {
  it("is exported from rpcContracts", async () => {
    const contracts = await import("../../src/services/rpcContracts.js");
    expect(typeof contracts.parseDocumentExtractionRunRow).toBe("function");
  });

  it("parses all required fields", async () => {
    const { parseDocumentExtractionRunRow } = await import("../../src/services/rpcContracts.js");
    const row = parseDocumentExtractionRunRow({
      id: "run-1",
      account_id: "acc-1",
      document_id: "doc-1",
      extractor: "AUTO",
      status: "QUEUED",
      metadata: { language_hint: "en" },
      created_at: "2026-01-01T00:00:00Z",
    });

    expect(row.id).toBe("run-1");
    expect(row.extractor).toBe("auto");   // lowercased
    expect(row.status).toBe("queued");    // lowercased
    expect(row.metadata.language_hint).toBe("en");
  });

  it("defaults status to queued", async () => {
    const { parseDocumentExtractionRunRow } = await import("../../src/services/rpcContracts.js");
    const row = parseDocumentExtractionRunRow({
      id: "run-1", account_id: "acc-1", document_id: "doc-1", extractor: "auto",
    });
    expect(row.status).toBe("queued");
  });
});

// ── Account isolation contract ────────────────────────────────────────────────

describe("account isolation: extraction service rejects missing account", () => {
  it("getDocumentExtraction returns null for null accountId", async () => {
    const { getDocumentExtraction } = await import("../../src/services/documentExtractionService.js");
    const result = await getDocumentExtraction(null, "doc-1");
    expect(result).toBeNull();
  });

  it("listDocumentExtractions returns empty array for null accountId", async () => {
    const { listDocumentExtractions } = await import("../../src/services/documentExtractionService.js");
    const result = await listDocumentExtractions(null);
    expect(result).toEqual([]);
  });

  it("listDocumentExtractionRuns returns empty array for null accountId", async () => {
    const { listDocumentExtractionRuns } = await import("../../src/services/documentExtractionService.js");
    const result = await listDocumentExtractionRuns(null);
    expect(result).toEqual([]);
  });
});
