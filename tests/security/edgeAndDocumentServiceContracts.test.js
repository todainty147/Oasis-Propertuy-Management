import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    auth: {
      getSession: (...args) => getSessionMock(...args),
    },
  },
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    ilike: vi.fn(() => query),
    contains: vi.fn(() => query),
    or: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("edge and document service contracts", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getSessionMock.mockReset();
    vi.restoreAllMocks();
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
        },
      },
    });
  });

  it("returns parsed document rows from list and search helpers", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "documents") {
        return createThenableQuery({
          data: [
            {
              id: "doc-1",
              account_id: "account-1",
              property_id: "property-1",
              tenant_id: null,
              scope: "PROPERTY",
              visibility: "STAFF",
              name: "inspection.pdf",
              original_filename: "inspection.pdf",
              mime_type: "application/pdf",
              size_bytes: "1024",
              storage_path: "account/account-1/documents/inspection.pdf",
              upload_status: "UPLOADED",
              tags: ["inspection_report"],
              created_at: "2026-03-28T12:00:00Z",
              updated_at: "2026-03-28T12:00:00Z",
            },
          ],
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { fetchDocuments, searchDocuments } = await import("../../src/services/documentService.js");

    const listRows = await fetchDocuments({ accountId: "account-1", propertyId: "11111111-1111-1111-1111-111111111111" });
    const searchRows = await searchDocuments({ accountId: "account-1", query: "inspect" });

    expect(listRows).toEqual([
      expect.objectContaining({
        id: "doc-1",
        scope: "property",
        visibility: "staff",
        size_bytes: 1024,
        upload_status: "uploaded",
      }),
    ]);
    expect(searchRows[0]).toMatchObject({
      id: "doc-1",
      scope: "property",
      visibility: "staff",
    });
  });

  it("returns parsed billing edge responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://billing.example.test/session", trialDays: 14 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { startCheckout, openCustomerPortal } = await import("../../src/services/billingService.js");

    const checkout = await startCheckout({ accountId: "account-1", planKey: "growth" });
    const portal = await openCustomerPortal({ accountId: "account-1" });

    expect(checkout).toEqual({
      url: "https://billing.example.test/session",
      trialDays: 14,
    });
    expect(portal).toEqual({
      url: "https://billing.example.test/session",
      trialDays: 14,
    });
  });

  it("returns parsed security audit export run responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        jobId: "job-1",
        status: "COMPLETED",
        rowCount: 42,
        artifactBucket: "security-audit-exports",
        artifactPath: "account/account-1/security_audit_exports/job-1/export.csv",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { runSecurityAuditExportJob } = await import("../../src/services/securityAuditService.js");
    const result = await runSecurityAuditExportJob("job-1");

    expect(result).toEqual({
      ok: true,
      jobId: "job-1",
      status: "completed",
      rowCount: 42,
      artifactBucket: "security-audit-exports",
      artifactPath: "account/account-1/security_audit_exports/job-1/export.csv",
    });
  });
});
