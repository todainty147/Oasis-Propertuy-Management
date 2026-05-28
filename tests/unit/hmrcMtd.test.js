import { describe, expect, it } from "vitest";

import {
  assertLiveSubmissionDisabled,
  createOauthStateExpiry,
  decryptToken,
  encryptToken,
  ensureSandboxProbeScope,
  generateOauthStateToken,
  isOauthStateExpired,
  normalizeHmrcConnectionStatus,
  safeHmrcConnectionPayload,
  validateHmrcScopes,
} from "../../supabase/functions/_shared/hmrcMtd.ts";
import {
  HMRC_ACCEPT_HEADERS,
  maskNino,
  normalizeHmrcError,
  normalizeSandboxNino,
  normalizeTestBusinessType,
  safeTaxYear,
  summarizeBusinessDetails,
  summarizeObligations,
  taxYearAccountingPeriod,
} from "../../supabase/functions/_shared/hmrcMtdReadOnlyHelpers.ts";

describe("HMRC MTD sandbox helpers", () => {
  it("generates OAuth state tokens and expiry windows", () => {
    const token = generateOauthStateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const now = new Date("2026-05-28T10:00:00Z");
    const expiresAt = createOauthStateExpiry(now, 10);
    expect(isOauthStateExpired(expiresAt, new Date("2026-05-28T10:09:59Z"))).toBe(false);
    expect(isOauthStateExpired(expiresAt, new Date("2026-05-28T10:10:00Z"))).toBe(true);
  });

  it("allows approved sandbox scopes without allowing live submission", () => {
    expect(validateHmrcScopes(["hello"])).toEqual(["hello"]);
    expect(validateHmrcScopes(["read:self-assessment"])).toEqual(["read:self-assessment"]);
    expect(validateHmrcScopes(["write:self-assessment"])).toEqual(["write:self-assessment"]);
    expect(validateHmrcScopes(["hello", "read:self-assessment"])).toEqual(["hello", "read:self-assessment"]);
    expect(validateHmrcScopes([])).toContain("read:self-assessment");
    expect(validateHmrcScopes([])).not.toContain("write:self-assessment");
    expect(() => validateHmrcScopes(["submit:self-assessment"])).toThrow(/unsupported hmrc scope/i);
  });

  it("adds the harmless sandbox probe scope server-side", () => {
    expect(ensureSandboxProbeScope(["read:self-assessment"])).toEqual(["hello", "read:self-assessment"]);
    expect(ensureSandboxProbeScope(["hello", "read:self-assessment"])).toEqual(["hello", "read:self-assessment"]);
  });

  it("encrypts and decrypts tokens without returning plaintext ciphertext", async () => {
    const ciphertext = await encryptToken("sandbox-access-token", "test-encryption-key");
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("sandbox-access-token");
    await expect(decryptToken(ciphertext, "test-encryption-key")).resolves.toBe("sandbox-access-token");
  });

  it("normalizes safe connection status payloads without token fields", () => {
    const safe = safeHmrcConnectionPayload({
      connection_status: "CONNECTED",
      environment: "sandbox",
      scopes: ["read:self-assessment"],
      access_token_ciphertext: "secret",
      refresh_token_ciphertext: "secret",
    });
    expect(safe.connection_status).toBe("connected");
    expect(JSON.stringify(safe)).not.toContain("ciphertext");
  });

  it("keeps the live submission guard closed", () => {
    expect(assertLiveSubmissionDisabled()).toBe(true);
    expect(normalizeHmrcConnectionStatus("unexpected")).toBe("not_connected");
  });

  it("uses HMRC versioned Accept headers for real read-only probes", () => {
    expect(HMRC_ACCEPT_HEADERS.businessDetails).toBe("application/vnd.hmrc.2.0+json");
    expect(HMRC_ACCEPT_HEADERS.obligations).toBe("application/vnd.hmrc.3.0+json");
    expect(HMRC_ACCEPT_HEADERS.propertyBusiness).toBe("application/vnd.hmrc.6.0+json");
    expect(HMRC_ACCEPT_HEADERS.testSupport).toBe("application/vnd.hmrc.1.0+json");
  });

  it("normalizes HMRC read-only errors into safe frontend codes", () => {
    expect(normalizeHmrcError(400, { code: "FORMAT_NINO" }).safeCode).toBe("missing_test_identifier");
    expect(normalizeHmrcError(401, {}).safeCode).toBe("token_expired");
    expect(normalizeHmrcError(403, {}).safeCode).toBe("insufficient_scope");
    expect(normalizeHmrcError(404, { code: "MATCHING_RESOURCE_NOT_FOUND" }).safeCode).toBe("connected_but_no_data");
  });

  it("formats sandbox identifiers and safe readiness summaries", () => {
    expect(normalizeSandboxNino(" aa 000000 a ")).toBe("AA000000A");
    expect(maskNino("AA000000A")).toBe("AA****A");
    expect(summarizeBusinessDetails({ businesses: [{ businessId: "X123", typeOfBusiness: "uk-property" }] })).toEqual({
      businessCount: 1,
      hasUkProperty: true,
      hasForeignProperty: false,
      discoveredIncomeSourceIdsCount: 1,
      firstIncomeSourceId: "X123",
    });
    expect(summarizeObligations({ obligations: [{ status: "O", dueDate: "2026-08-07" }] })).toEqual({
      obligationCount: 1,
      openCount: 1,
      fulfilledCount: 0,
      nextDueDate: "2026-08-07",
    });
  });

  it("normalizes HMRC sandbox test-data inputs", () => {
    expect(safeTaxYear("2026-27")).toBe("2026-27");
    expect(safeTaxYear("2026-28")).toBe("2026-28");
    expect(safeTaxYear("bad")).toBe("2026-27");
    expect(taxYearAccountingPeriod("2026-27")).toEqual({
      taxYear: "2026-27",
      startDate: "2026-04-06",
      endDate: "2027-04-05",
    });
    expect(normalizeTestBusinessType("foreign-property")).toBe("foreign-property");
    expect(normalizeTestBusinessType("unexpected")).toBe("uk-property");
  });
});
