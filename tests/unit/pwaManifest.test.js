// tests/unit/pwaManifest.test.js
// Validates the PWA manifest.json meets minimum requirements for installability.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

let manifest;

beforeAll(() => {
  const manifestPath = resolve(process.cwd(), "public", "manifest.json");
  const raw = readFileSync(manifestPath, "utf-8");
  manifest = JSON.parse(raw);
});

describe("PWA manifest.json", () => {
  it("exists and is valid JSON", () => {
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe("object");
  });

  it("has correct app name", () => {
    expect(manifest.name).toBe("Tenaqo");
  });

  it("has correct short name", () => {
    expect(manifest.short_name).toBe("Tenaqo");
  });

  it("has a description", () => {
    expect(manifest.description).toBeTruthy();
    expect(manifest.description.length).toBeGreaterThan(10);
  });

  it("uses standalone display mode", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("has a valid start_url", () => {
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.start_url.startsWith("/")).toBe(true);
  });

  it("has a valid scope", () => {
    expect(manifest.scope).toBe("/");
  });

  it("has Tenaqo brand theme colour", () => {
    expect(manifest.theme_color).toBe("#0b4f6c");
  });

  it("has a background colour", () => {
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.background_color.startsWith("#")).toBe(true);
  });

  it("has icons array", () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one icon with purpose 'any'", () => {
    const icon = manifest.icons.find((i) => i.purpose?.includes("any"));
    expect(icon).toBeDefined();
    expect(icon.src).toBeTruthy();
  });

  it("includes a PNG icon", () => {
    const png = manifest.icons.find((i) => i.type === "image/png");
    expect(png).toBeDefined();
    expect(png.src).toMatch(/\.png$/);
  });

  it("uses Tenaqo production app icons", () => {
    expect(manifest.icons.map((icon) => icon.src)).toEqual(
      expect.arrayContaining([
        "/brand/tenaqo/app-icon-512.png",
        "/brand/tenaqo/app-icon-maskable-512.png",
      ]),
    );
  });

  it("includes a maskable icon", () => {
    const maskable = manifest.icons.find((i) => i.purpose?.includes("maskable"));
    expect(maskable).toBeDefined();
  });

  it("all icon src paths start with /", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
    }
  });

  it("does not expose sensitive data in shortcuts", () => {
    if (!manifest.shortcuts) return;
    for (const shortcut of manifest.shortcuts) {
      // Shortcuts should not expose internal IDs or auth tokens
      expect(shortcut.url).not.toMatch(/token/i);
      expect(shortcut.url).not.toMatch(/secret/i);
      expect(shortcut.url).not.toMatch(/api_key/i);
    }
  });

  it("has language set", () => {
    expect(manifest.lang).toBeTruthy();
  });
});

describe("offline.html", () => {
  it("offline fallback page exists", () => {
    const path = resolve(process.cwd(), "public", "offline.html");
    const content = readFileSync(path, "utf-8");
    expect(content).toBeTruthy();
    expect(content).toContain("offline");
  });

  it("offline page does not contain auth tokens or sensitive data", () => {
    const path = resolve(process.cwd(), "public", "offline.html");
    const content = readFileSync(path, "utf-8");
    expect(content).not.toMatch(/supabase.*key/i);
    expect(content).not.toMatch(/VITE_/i);
    expect(content).not.toMatch(/access_token/i);
  });

  it("offline page has a retry mechanism", () => {
    const path = resolve(process.cwd(), "public", "offline.html");
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/reload|retry|again/i);
  });
});
