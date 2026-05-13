// tests/unit/mobileRoutes.test.js
// Unit tests for mobile route resolution and deep link parsing.

import { describe, it, expect } from "vitest";
import {
  resolveRoleHome,
  parseMobileDeepLink,
  ROLE_HOME_PATHS,
  DEFAULT_HOME_PATH,
} from "../../src/utils/mobileRoutes.js";

// ── resolveRoleHome ───────────────────────────────────────────────────────────

describe("resolveRoleHome", () => {
  it("returns Command Center for owner", () => {
    expect(resolveRoleHome("owner")).toBe("/command-center");
  });

  it("returns Command Center for admin", () => {
    expect(resolveRoleHome("admin")).toBe("/command-center");
  });

  it("returns Command Center for staff", () => {
    expect(resolveRoleHome("staff")).toBe("/command-center");
  });

  it("returns tenant home for tenant role", () => {
    expect(resolveRoleHome("tenant")).toBe("/tenant/home");
  });

  it("returns contractor portal for contractor role", () => {
    expect(resolveRoleHome("contractor")).toBe("/contractor-portal");
  });

  it("is case-insensitive", () => {
    expect(resolveRoleHome("OWNER")).toBe("/command-center");
    expect(resolveRoleHome("TENANT")).toBe("/tenant/home");
    expect(resolveRoleHome("Contractor")).toBe("/contractor-portal");
  });

  it("returns default path for unknown role", () => {
    expect(resolveRoleHome("superadmin")).toBe(DEFAULT_HOME_PATH);
    expect(resolveRoleHome("viewer")).toBe(DEFAULT_HOME_PATH);
  });

  it("returns default path for null", () => {
    expect(resolveRoleHome(null)).toBe(DEFAULT_HOME_PATH);
  });

  it("returns default path for undefined", () => {
    expect(resolveRoleHome(undefined)).toBe(DEFAULT_HOME_PATH);
  });

  it("returns default path for empty string", () => {
    expect(resolveRoleHome("")).toBe(DEFAULT_HOME_PATH);
  });

  it("covers all defined roles in ROLE_HOME_PATHS", () => {
    for (const [role, path] of Object.entries(ROLE_HOME_PATHS)) {
      expect(resolveRoleHome(role)).toBe(path);
    }
  });
});

// ── parseMobileDeepLink ───────────────────────────────────────────────────────

describe("parseMobileDeepLink", () => {
  it("resolves command center deep link", () => {
    expect(parseMobileDeepLink("/mobile/command-center")).toBe("/command-center");
  });

  it("resolves maintenance list deep link", () => {
    expect(parseMobileDeepLink("/mobile/maintenance")).toBe("/maintenance-inbox");
  });

  it("resolves maintenance item deep link with ID", () => {
    const result = parseMobileDeepLink("/mobile/maintenance/abc-123");
    expect(result).toBe("/maintenance-inbox?requestId=abc-123");
  });

  it("resolves work order item deep link with ID", () => {
    const result = parseMobileDeepLink("/mobile/work-orders/wo-456");
    expect(result).toBe("/work-orders/wo-456");
  });

  it("returns null for work-orders without ID", () => {
    expect(parseMobileDeepLink("/mobile/work-orders")).toBeNull();
  });

  it("resolves documents list deep link", () => {
    expect(parseMobileDeepLink("/mobile/documents")).toBe("/documents");
  });

  it("resolves document item with ID", () => {
    const result = parseMobileDeepLink("/mobile/documents/doc-789");
    expect(result).toBe("/documents?id=doc-789");
  });

  it("resolves finance payment deep link with ID", () => {
    const result = parseMobileDeepLink("/mobile/finance/pay-001");
    expect(result).toBe("/finance?paymentId=pay-001");
  });

  it("resolves compliance list deep link", () => {
    expect(parseMobileDeepLink("/mobile/compliance")).toBe("/compliance");
  });

  it("resolves compliance item with ID", () => {
    const result = parseMobileDeepLink("/mobile/compliance/item-999");
    expect(result).toBe("/compliance?item=item-999");
  });

  it("resolves tenant home deep link", () => {
    expect(parseMobileDeepLink("/mobile/tenant")).toBe("/tenant/home");
  });

  it("resolves tenant issue with ID", () => {
    const result = parseMobileDeepLink("/mobile/tenant/issue-321");
    expect(result).toBe("/tenant/maintenance/issue-321");
  });

  it("returns null for unknown deep link segment", () => {
    expect(parseMobileDeepLink("/mobile/unknown-route")).toBeNull();
    expect(parseMobileDeepLink("/mobile/admin/panel")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseMobileDeepLink(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseMobileDeepLink("")).toBeNull();
  });

  it("strips query strings before parsing", () => {
    const result = parseMobileDeepLink("/mobile/maintenance/req-123?foo=bar");
    expect(result).toBe("/maintenance-inbox?requestId=req-123");
  });
});
