import { describe, expect, it } from "vitest";

import {
  checkatradeCategoryMap,
  inferCheckatradeCategoryId,
  resolveCategoryEntry,
} from "../../src/config/checkatradeCategoryMap.js";

describe("checkatradeCategoryMap", () => {
  it("has at least 15 curated categories", () => {
    expect(checkatradeCategoryMap.length).toBeGreaterThanOrEqual(15);
  });

  it("every entry has a non-empty key, label, positive integer categoryId, and keywords array", () => {
    for (const entry of checkatradeCategoryMap) {
      expect(typeof entry.key).toBe("string");
      expect(entry.key.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(Number.isInteger(entry.categoryId)).toBe(true);
      expect(entry.categoryId).toBeGreaterThan(0);
      expect(Array.isArray(entry.keywords)).toBe(true);
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it("resolves plumbing categoryId from exact key match", () => {
    expect(inferCheckatradeCategoryId("plumbing")).toBe(667);
  });

  it("resolves plumbing categoryId from keyword match (partial free text)", () => {
    expect(inferCheckatradeCategoryId("leaking pipe in bathroom")).toBe(667);
    expect(inferCheckatradeCategoryId("dripping tap under kitchen sink")).toBe(667);
  });

  it("resolves electrical from free-text description", () => {
    const id = inferCheckatradeCategoryId("faulty light socket in bedroom");
    expect(id).not.toBeNull();
    expect(id).toBeGreaterThan(0);
  });

  it("resolves heating/boiler from common tenant descriptions", () => {
    const id = inferCheckatradeCategoryId("boiler not working, no hot water");
    expect(id).not.toBeNull();
  });

  it("returns null for unrecognised trade text", () => {
    expect(inferCheckatradeCategoryId("")).toBeNull();
    expect(inferCheckatradeCategoryId(null)).toBeNull();
    expect(inferCheckatradeCategoryId("xyzzy undefined trade")).toBeNull();
  });

  it("resolveCategoryEntry returns the full entry for a keyword match", () => {
    const entry = resolveCategoryEntry("blocked drain");
    expect(entry).not.toBeNull();
    expect(entry.key).toBe("drainage");
  });

  it("resolveCategoryEntry returns null for no match", () => {
    expect(resolveCategoryEntry("")).toBeNull();
    expect(resolveCategoryEntry("completely unrelated text xyz")).toBeNull();
  });

  it("all keys are unique", () => {
    const keys = checkatradeCategoryMap.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all categoryId values are unique", () => {
    const ids = checkatradeCategoryMap.map((e) => e.categoryId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
