// tests/security/passwordPolicyContracts.test.js
//
// Unit + contract tests for the shared password policy utility.
// These tests run in the standard Vitest environment (no Supabase harness).
//
// Spec coverage:
//   - rejects obvious weak passwords
//   - rejects repeated characters
//   - rejects simple sequences
//   - rejects passwords containing personal context (email, name, account name)
//   - accepts a strong password
//   - score / label / requirements shape are correct
//   - every password-creation flow imports validatePasswordStrength (regression)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getPasswordRequirements,
  getPasswordStrengthScore,
  validatePasswordStrength,
} from "../../src/utils/passwordPolicy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// validatePasswordStrength — rejects weak passwords
// ---------------------------------------------------------------------------

describe("validatePasswordStrength — rejects weak passwords", () => {
  it("rejects '123456789' (too short, no uppercase, no symbol)", () => {
    const r = validatePasswordStrength("123456789");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("minLength");
    expect(r.failedKeys).toContain("uppercase");
    expect(r.failedKeys).toContain("symbol");
  });

  it("rejects 'password123' (too short, no uppercase, no symbol)", () => {
    const r = validatePasswordStrength("password123");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("minLength");
    expect(r.failedKeys).toContain("uppercase");
    expect(r.failedKeys).toContain("symbol");
  });

  it("rejects 'Password123' (too short, no symbol)", () => {
    const r = validatePasswordStrength("Password123");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("minLength");
    expect(r.failedKeys).toContain("symbol");
  });

  it("rejects 'Password123!' (12 chars but in common-password list)", () => {
    const r = validatePasswordStrength("Password123!");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noCommon");
  });

  it("rejects 'password123!' (12 chars, common, no uppercase)", () => {
    const r = validatePasswordStrength("password123!");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noCommon");
    expect(r.failedKeys).toContain("uppercase");
  });

  it("rejects empty string", () => {
    const r = validatePasswordStrength("");
    expect(r.valid).toBe(false);
    expect(r.score).toBe(0);
  });

  it("rejects undefined/null gracefully", () => {
    expect(validatePasswordStrength(undefined).valid).toBe(false);
    expect(validatePasswordStrength(null).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePasswordStrength — rejects repeated characters
// ---------------------------------------------------------------------------

describe("validatePasswordStrength — rejects repeated characters", () => {
  it("rejects password with 3+ same character run (AAAaaa1$$$$$$$)", () => {
    const r = validatePasswordStrength("AAAaaa1$$$$$$$");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noRepeats");
  });

  it("rejects password with 'aaabbb111!!!' pattern", () => {
    const r = validatePasswordStrength("Aaabbb111!!!");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noRepeats");
  });

  it("allows two consecutive same characters", () => {
    const r = validatePasswordStrength("Tr00per!IsAmazingX");
    // Should NOT fail on noRepeats for "00" (only 2 consecutive)
    expect(r.failedKeys).not.toContain("noRepeats");
  });
});

// ---------------------------------------------------------------------------
// validatePasswordStrength — rejects simple sequences
// ---------------------------------------------------------------------------

describe("validatePasswordStrength — rejects simple sequences", () => {
  it("rejects password containing '1234' keyboard sequence", () => {
    const r = validatePasswordStrength("MyPassw1234!Great");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noSequence");
  });

  it("rejects password containing 'abcd' alphabetical sequence", () => {
    const r = validatePasswordStrength("Abcdef!MyStr0ng");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noSequence");
  });

  it("rejects password containing 'qwer' keyboard sequence", () => {
    const r = validatePasswordStrength("Qwerty!Super1Saf");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noSequence");
  });

  it("rejects reversed sequences like '4321'", () => {
    const r = validatePasswordStrength("My4321!SuperPass");
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noSequence");
  });
});

// ---------------------------------------------------------------------------
// validatePasswordStrength — rejects personal information
// ---------------------------------------------------------------------------

describe("validatePasswordStrength — rejects personal info from context", () => {
  it("rejects password containing email local-part", () => {
    const r = validatePasswordStrength("Johndoe!Strong99X", { email: "johndoe@example.com" });
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noPersonal");
  });

  it("rejects password containing the user's name part", () => {
    const r = validatePasswordStrength("Amanda!Secure99X!", { name: "Amanda Clarke" });
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noPersonal");
  });

  it("rejects password containing account name", () => {
    const r = validatePasswordStrength("AcmeRentals!X99z", { accountName: "Acme Rentals" });
    expect(r.valid).toBe(false);
    expect(r.failedKeys).toContain("noPersonal");
  });

  it("does NOT add noPersonal requirement when context is empty", () => {
    const r = validatePasswordStrength("J0hn!SecurePass99");
    expect(r.requirements.map((r2) => r2.key)).not.toContain("noPersonal");
  });

  it("allows password that does not match any context field", () => {
    const r = validatePasswordStrength("Xr7!Velvet#Bloom2", {
      email: "alice@example.com",
      name: "Alice Smith",
      accountName: "Sunset Lettings",
    });
    // Context checks pass; other requirements also pass for this strong password
    if (!r.valid) {
      // If invalid, it should NOT be because of noPersonal
      expect(r.failedKeys).not.toContain("noPersonal");
    }
  });
});

// ---------------------------------------------------------------------------
// validatePasswordStrength — accepts a strong password
// ---------------------------------------------------------------------------

describe("validatePasswordStrength — accepts strong passwords", () => {
  it("accepts a strong password with all character classes and length ≥12", () => {
    const r = validatePasswordStrength("Velvet#Bloom2026!");
    expect(r.valid).toBe(true);
    expect(r.score).toBe(4);
    expect(r.label).toBe("Strong");
    expect(r.errors).toHaveLength(0);
    expect(r.failedKeys).toHaveLength(0);
  });

  it("accepts another strong password not in common list", () => {
    const r = validatePasswordStrength("Tr0ub4dor&3!Moon");
    expect(r.valid).toBe(true);
  });

  it("accepts a strong password with context that is unrelated", () => {
    const r = validatePasswordStrength("Velvet#Bloom2026!", {
      email: "carol@sunset.co.uk",
      name: "Carol Benson",
      accountName: "Sunset Lettings",
    });
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Return shape contracts
// ---------------------------------------------------------------------------

describe("validatePasswordStrength — return shape", () => {
  it("always returns valid, score, label, labelKey, errors, failedKeys, requirements", () => {
    const r = validatePasswordStrength("test");
    expect(typeof r.valid).toBe("boolean");
    expect(typeof r.score).toBe("number");
    expect(typeof r.label).toBe("string");
    expect(typeof r.labelKey).toBe("string");
    expect(Array.isArray(r.errors)).toBe(true);
    expect(Array.isArray(r.failedKeys)).toBe(true);
    expect(Array.isArray(r.requirements)).toBe(true);
  });

  it("each requirement has key, i18nKey, label, met", () => {
    const r = validatePasswordStrength("Hello1!");
    for (const req of r.requirements) {
      expect(typeof req.key).toBe("string");
      expect(typeof req.i18nKey).toBe("string");
      expect(typeof req.label).toBe("string");
      expect(typeof req.met).toBe("boolean");
    }
  });

  it("score is between 0 and 4 inclusive", () => {
    for (const pw of ["", "weak", "password123!", "Password123!", "Velvet#Bloom2026!"]) {
      const s = getPasswordStrengthScore(pw);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(4);
    }
  });

  it("label matches score", () => {
    const r = validatePasswordStrength("Velvet#Bloom2026!");
    expect(r.score).toBe(4);
    expect(r.label).toBe("Strong");
  });

  it("valid true implies score === 4", () => {
    const strong = "Velvet#Bloom2026!";
    const r = validatePasswordStrength(strong);
    if (r.valid) expect(r.score).toBe(4);
  });

  it("getPasswordRequirements returns same requirements as validatePasswordStrength", () => {
    const pw = "Hello1!world";
    const reqs = getPasswordRequirements(pw);
    const { requirements } = validatePasswordStrength(pw);
    expect(reqs).toEqual(requirements);
  });
});

// ---------------------------------------------------------------------------
// Regression: every password-creation flow must import validatePasswordStrength
// ---------------------------------------------------------------------------

describe("auth flow regression — all password-creation pages use the shared validator", () => {
  const PASSWORD_FLOWS = [
    "src/pages/LandlordSignup.jsx",
    "src/pages/Invite.jsx",
    "src/pages/ResetPassword.jsx",
    "src/pages/ProfilePage.jsx",
  ];

  for (const file of PASSWORD_FLOWS) {
    it(`${file} imports validatePasswordStrength`, () => {
      const src = readSource(file);
      expect(src).toContain("validatePasswordStrength");
      expect(src).toContain("passwordPolicy");
    });

    it(`${file} calls logSecurityRelevantFailure on rejection`, () => {
      const src = readSource(file);
      expect(src).toContain("logSecurityRelevantFailure");
      expect(src).toContain("auth_weak_password_rejected");
    });
  }

  it("no password-creation page calls supabase.auth without first using validatePasswordStrength", () => {
    for (const file of PASSWORD_FLOWS) {
      const src = readSource(file);
      const hasSignUp     = src.includes("supabase.auth.signUp");
      const hasUpdateUser = src.includes("supabase.auth.updateUser");
      if (hasSignUp || hasUpdateUser) {
        expect(src).toContain("validatePasswordStrength");
      }
    }
  });

  it("Login.jsx does NOT import validatePasswordStrength (login must not block existing users)", () => {
    const src = readSource("src/pages/Login.jsx");
    expect(src).not.toContain("validatePasswordStrength");
  });

  it("delayed self-serve signup bootstrap records the validated password as strong", () => {
    const src = readSource("src/context/AccountContext.jsx");
    expect(src).toContain("recordStrongPassword");
    expect(src).toMatch(/finalizeSelfServeLandlordAccount[\s\S]*await recordStrongPassword\(newId\)/);
  });
});
