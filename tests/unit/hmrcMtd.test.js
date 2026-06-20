import { describe, expect, it } from "vitest";

import {
  assertLiveSubmissionDisabled,
  createPkceCodeChallenge,
  createOauthStateExpiry,
  decryptToken,
  encryptToken,
  ensureSandboxProbeScope,
  generatePkceCodeVerifier,
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
  normalizeHmrcNetworkError,
  normalizeSandboxNino,
  normalizeTestBusinessType,
  safeTaxYear,
  buildPropertyBusinessReadPath,
  summarizeBusinessDetails,
  summarizeObligations,
  summarizePropertyBusiness,
  taxYearAccountingPeriod,
  normalizeAccountingType,
} from "../../supabase/functions/_shared/hmrcMtdReadOnlyHelpers.ts";
import {
  buildHmrcFraudPreventionHeaders,
  safeHmrcFraudHeaderEvidence,
  sanitizeHmrcDiagnosticValue,
} from "../../supabase/functions/_shared/hmrcFraudPreventionHeaders.ts";

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
    expect(ciphertext).toMatch(/^v2\./);
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
    expect(() => assertLiveSubmissionDisabled("production", "false")).toThrow(/disabled/);
    expect(() => assertLiveSubmissionDisabled("sandbox", "true")).toThrow(/disabled/);
    expect(normalizeHmrcConnectionStatus("unexpected")).toBe("not_connected");
  });

  it("generates PKCE verifier and challenge values", async () => {
    const verifier = generatePkceCodeVerifier();
    const challenge = await createPkceCodeChallenge(verifier);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64,}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    await expect(createPkceCodeChallenge(verifier)).resolves.toBe(challenge);
  });

  it("uses HMRC versioned Accept headers for real read-only probes", () => {
    expect(HMRC_ACCEPT_HEADERS.businessDetails).toBe("application/vnd.hmrc.2.0+json");
    expect(HMRC_ACCEPT_HEADERS.obligations).toBe("application/vnd.hmrc.3.0+json");
    expect(HMRC_ACCEPT_HEADERS.propertyBusiness).toBe("application/vnd.hmrc.6.0+json");
    expect(HMRC_ACCEPT_HEADERS.testSupport).toBe("application/vnd.hmrc.1.0+json");
  });

  it("normalizes HMRC read-only errors into safe frontend codes", () => {
    expect(normalizeHmrcError(400, { code: "FORMAT_NINO" }).safeCode).toBe("format_nino");
    expect(normalizeHmrcError(400, { code: "FORMAT_BUSINESS_ID", message: "The provided Business ID is invalid" }).message).toContain("Business ID");
    expect(normalizeHmrcError(401, {}).safeCode).toBe("token_expired");
    expect(normalizeHmrcError(403, {}).safeCode).toBe("insufficient_scope");
    expect(normalizeHmrcError(404, { code: "MATCHING_RESOURCE_NOT_FOUND" }).safeCode).toBe("connected_but_no_data");
    expect(normalizeHmrcError(409, {}).safeCode).toBe("already_submitted");
    expect(normalizeHmrcError(422, {}).safeCode).toBe("business_rule_failed");
    expect(normalizeHmrcError(429, {}).safeCode).toBe("rate_limited");
    expect(normalizeHmrcNetworkError(new Error("request timed out")).safeCode).toBe("network_timeout");
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
      accountingTypes: [{ businessId: "X123", accountingType: null }],
      firstUkPropertyAccountingType: null,
    });
    expect(summarizeBusinessDetails({ businesses: [{ businessId: "Y456", typeOfBusiness: "FOREIGN_PROPERTY" }] }).hasForeignProperty).toBe(true);
    expect(summarizeBusinessDetails({ businesses: [{ businessId: "Z789", typeOfBusiness: "SELF_EMPLOYMENT", tradingName: "Property Lane Ltd" }] }).hasUkProperty).toBe(false);
    expect(summarizeObligations({ obligations: [{ status: "O", dueDate: "2026-08-07" }] })).toEqual({
      obligationCount: 1,
      openCount: 1,
      fulfilledCount: 0,
      nextDueDate: "2026-08-07",
    });
    expect(summarizeObligations({ obligations: [{ nested: { status: "open" }, status: "F" }] })).toMatchObject({
      openCount: 0,
      fulfilledCount: 1,
    });
    expect(summarizePropertyBusiness({ ukProperty: { income: {} } }, "2026-27", "uk-property")).toEqual({
      periodSummaryCount: 1,
      annualSubmissionFound: false,
      ukPropertyFound: true,
      foreignPropertyFound: false,
      endpointMode: "cumulative",
    });
  });

  it("parses Business Details accounting type safely", () => {
    expect(normalizeAccountingType("cash")).toBe("CASH");
    expect(normalizeAccountingType("traditional")).toBe("ACCRUALS");
    expect(normalizeAccountingType("unexpected-new-value")).toBe("UNKNOWN");
    expect(summarizeBusinessDetails({
      businesses: [{ businessId: "X123", typeOfBusiness: "uk-property", accountingType: "CASH" }],
    }).firstUkPropertyAccountingType).toBe("CASH");
  });

  it("builds safe fraud-prevention headers and records names rather than values", () => {
    const result = buildHmrcFraudPreventionHeaders({
      accountId: "account-1",
      userId: "user-1",
      publicIp: "203.0.113.10",
      publicIpTimestamp: "2026-06-20T10:00:00Z",
      productVersion: "1.2.3",
    });
    expect(result.headers["Gov-Client-Connection-Method"]).toBe("OTHER_DIRECT");
    expect(result.headers["Gov-Client-User-IDs"]).toContain("user-1");
    expect(result.headers["Gov-Vendor-Version"]).toContain("1.2.3");
    const evidence = safeHmrcFraudHeaderEvidence(result.headers, result.missingContext);
    expect(evidence.presentHeaders).toContain("Gov-Client-Public-IP");
    expect(evidence.valuesRecorded).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain("203.0.113.10");
  });

  it("handles missing fraud context and strips sensitive diagnostic fields", () => {
    const result = buildHmrcFraudPreventionHeaders();
    expect(result.missingContext).toEqual(expect.arrayContaining(["accountId", "userId", "publicIp"]));
    expect(sanitizeHmrcDiagnosticValue({
      status: "failed",
      access_token: "secret",
      nested: { payload: { income: 1 }, safeCode: "bad_request" },
    })).toEqual({ status: "failed", nested: { safeCode: "bad_request" } });
  });

  it("uses a deterministic sanitized account fallback for device id without exposing it in evidence", () => {
    const first = buildHmrcFraudPreventionHeaders({ accountId: " account-123\r\n", userId: "user-1" });
    const second = buildHmrcFraudPreventionHeaders({ accountId: "account-123", userId: "user-1" });
    expect(first.headers["Gov-Client-Device-ID"]).toBe("account-123");
    expect(second.headers["Gov-Client-Device-ID"]).toBe(first.headers["Gov-Client-Device-ID"]);
    expect(JSON.stringify(safeHmrcFraudHeaderEvidence(first.headers))).not.toContain("account-123");
  });

  it("normalizes HMRC sandbox test-data inputs", () => {
    expect(safeTaxYear("2026-27")).toBe("2026-27");
    expect(safeTaxYear("2026-28")).toBe("2026-27");
    expect(safeTaxYear("2026-99")).toBe("2026-27");
    expect(safeTaxYear("bad")).toBe("2026-27");
    expect(taxYearAccountingPeriod("2026-27")).toEqual({
      taxYear: "2026-27",
      startDate: "2026-04-06",
      endDate: "2027-04-05",
    });
    expect(normalizeTestBusinessType("foreign-property")).toBe("foreign-property");
    expect(normalizeTestBusinessType("unexpected")).toBe("uk-property");
    expect(buildPropertyBusinessReadPath("AA000000A", "XKIS00000000735", "2026-27", "uk-property")).toContain("/property/uk/AA000000A/XKIS00000000735/cumulative/2026-27");
    expect(buildPropertyBusinessReadPath("AA000000A", "XKIS00000000735", "2024-25", "uk-property")).toContain("/property/AA000000A/XKIS00000000735/period/2024-25");
  });
});
