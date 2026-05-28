import { describe, expect, it } from "vitest";

import {
  assertLiveSubmissionDisabled,
  createOauthStateExpiry,
  decryptToken,
  encryptToken,
  generateOauthStateToken,
  isOauthStateExpired,
  normalizeHmrcConnectionStatus,
  safeHmrcConnectionPayload,
  validateHmrcScopes,
} from "../../supabase/functions/_shared/hmrcMtd.ts";

describe("HMRC MTD sandbox helpers", () => {
  it("generates OAuth state tokens and expiry windows", () => {
    const token = generateOauthStateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const now = new Date("2026-05-28T10:00:00Z");
    const expiresAt = createOauthStateExpiry(now, 10);
    expect(isOauthStateExpired(expiresAt, new Date("2026-05-28T10:09:59Z"))).toBe(false);
    expect(isOauthStateExpired(expiresAt, new Date("2026-05-28T10:10:00Z"))).toBe(true);
  });

  it("allows only approved read-only scopes", () => {
    expect(validateHmrcScopes(["hello"])).toEqual(["hello"]);
    expect(validateHmrcScopes(["read:self-assessment"])).toEqual(["read:self-assessment"]);
    expect(validateHmrcScopes(["hello", "read:self-assessment"])).toEqual(["hello", "read:self-assessment"]);
    expect(validateHmrcScopes([])).toContain("read:self-assessment");
    expect(() => validateHmrcScopes(["write:self-assessment"])).toThrow(/unsupported hmrc scope/i);
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
});
