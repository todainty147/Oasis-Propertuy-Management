import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

describe("document signature readiness helpers", () => {
  let service;

  beforeEach(async () => {
    vi.resetModules();
    service = await import("../../src/services/documentSignatureService.js");
  });

  it("normalizes DocuSeal hosted domains into the API base URL", () => {
    expect(service.normalizeProviderBaseUrlForSave("docuseal", "https://docuseal.eu")).toBe("https://api.docuseal.eu");
    expect(service.normalizeProviderBaseUrlForSave("docuseal", "docuseal.com")).toBe("https://api.docuseal.com");
    expect(service.normalizeProviderBaseUrlForSave("docuseal", "https://api.docuseal.eu")).toBe("https://api.docuseal.eu");
  });

  it("requires a numeric DocuSeal template id when signatures are enabled", () => {
    expect(() => service.validateDocumentSignatureSettings({
      provider: "docuseal",
      providerBaseUrl: "https://api.docuseal.eu",
      defaultSignatureTemplateId: "contractor_terms",
      isEnabled: true,
    })).toThrow(/numeric/i);
  });

  it("returns normalized values for a valid DocuSeal setup", () => {
    expect(service.validateDocumentSignatureSettings({
      provider: "docuseal",
      providerBaseUrl: "docuseal.eu",
      defaultSignatureTemplateId: "520424",
      isEnabled: true,
    })).toEqual({
      provider: "docuseal",
      providerBaseUrl: "https://api.docuseal.eu",
      defaultSignatureTemplateId: "520424",
    });
  });
});
