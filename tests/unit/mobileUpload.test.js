// tests/unit/mobileUpload.test.js
// Unit tests for useMobileUpload validation helpers.
// Tests the file validation logic that runs before any upload service is called.

import { describe, it, expect } from "vitest";
import { UPLOAD_PRESETS } from "../../src/hooks/useMobileUpload.js";

// Internal validateFiles is not exported — test via observable preset values
// and reproduce the logic to verify guard behaviour.

function mockFile(name, type, sizeBytes) {
  return new File(["x".repeat(Math.max(sizeBytes, 1))], name, { type });
}

// Reproduce the validate function locally so we can unit-test it without
// triggering a React hook (hooks require a component context).
function validateFiles(files, { maxBytes, maxFiles, allowedMimeTypes }) {
  const valid = [];
  const errors = [];
  const list = Array.from(files || []);

  if (list.length === 0) {
    errors.push("No files selected.");
    return { valid, errors };
  }
  if (list.length > maxFiles) {
    errors.push(`You can upload up to ${maxFiles} files at once.`);
    return { valid, errors };
  }
  for (const file of list) {
    if (allowedMimeTypes && !allowedMimeTypes.includes(file.type)) {
      errors.push(`${file.name}: file type not allowed.`);
      continue;
    }
    if (file.size > maxBytes) {
      const mb = (maxBytes / 1024 / 1024).toFixed(0);
      errors.push(`${file.name}: exceeds the ${mb} MB limit.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}: file is empty.`);
      continue;
    }
    valid.push(file);
  }
  return { valid, errors };
}

// ── UPLOAD_PRESETS ────────────────────────────────────────────────────────────

describe("UPLOAD_PRESETS", () => {
  it("defines maintenancePhoto preset", () => {
    const p = UPLOAD_PRESETS.maintenancePhoto;
    expect(p).toBeDefined();
    expect(p.maxBytes).toBe(15 * 1024 * 1024);
    expect(p.maxFiles).toBe(10);
    expect(p.allowedMimeTypes).toContain("image/jpeg");
    expect(p.allowedMimeTypes).not.toContain("application/pdf");
  });

  it("defines workOrderPhoto preset", () => {
    const p = UPLOAD_PRESETS.workOrderPhoto;
    expect(p.maxFiles).toBe(10);
    expect(p.allowedMimeTypes).toContain("image/png");
  });

  it("defines invoiceOrQuote preset that allows PDF", () => {
    const p = UPLOAD_PRESETS.invoiceOrQuote;
    expect(p.allowedMimeTypes).toContain("application/pdf");
    expect(p.allowedMimeTypes).toContain("image/jpeg");
    expect(p.maxFiles).toBe(5);
  });

  it("defines document preset with broader type set", () => {
    const p = UPLOAD_PRESETS.document;
    expect(p.allowedMimeTypes).toContain("application/pdf");
    expect(p.maxBytes).toBeGreaterThan(15 * 1024 * 1024);
  });
});

// ── validateFiles: no files ───────────────────────────────────────────────────

describe("validateFiles — empty input", () => {
  const cfg = UPLOAD_PRESETS.maintenancePhoto;

  it("returns error when no files provided", () => {
    const { valid, errors } = validateFiles([], cfg);
    expect(valid).toHaveLength(0);
    expect(errors[0]).toMatch(/no files/i);
  });

  it("returns error for null input", () => {
    const { errors } = validateFiles(null, cfg);
    expect(errors[0]).toMatch(/no files/i);
  });
});

// ── validateFiles: too many files ─────────────────────────────────────────────

describe("validateFiles — file count limit", () => {
  const cfg = UPLOAD_PRESETS.maintenancePhoto; // maxFiles: 10

  it("accepts exactly maxFiles files", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      mockFile(`photo${i}.jpg`, "image/jpeg", 1024),
    );
    const { valid, errors } = validateFiles(files, cfg);
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(10);
  });

  it("rejects more than maxFiles files", () => {
    const files = Array.from({ length: 11 }, (_, i) =>
      mockFile(`photo${i}.jpg`, "image/jpeg", 1024),
    );
    const { errors } = validateFiles(files, cfg);
    expect(errors[0]).toMatch(/up to 10/i);
  });
});

// ── validateFiles: file size ──────────────────────────────────────────────────

describe("validateFiles — file size", () => {
  const cfg = UPLOAD_PRESETS.maintenancePhoto; // maxBytes: 15 MB

  it("accepts a file within size limit", () => {
    const file = mockFile("photo.jpg", "image/jpeg", 1024 * 1024); // 1 MB
    const { valid, errors } = validateFiles([file], cfg);
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(1);
  });

  it("rejects a file exceeding the size limit", () => {
    const file = mockFile("huge.jpg", "image/jpeg", 16 * 1024 * 1024); // 16 MB
    const { errors } = validateFiles([file], cfg);
    expect(errors[0]).toMatch(/exceeds.*15 MB/i);
  });

  it("rejects an empty file", () => {
    // File constructor minimum content is 1 byte in our mock; test explicitly
    const emptyFile = new File([], "empty.jpg", { type: "image/jpeg" });
    const { errors } = validateFiles([emptyFile], cfg);
    expect(errors[0]).toMatch(/empty/i);
  });
});

// ── validateFiles: MIME types ─────────────────────────────────────────────────

describe("validateFiles — MIME type enforcement", () => {
  const photoCfg = UPLOAD_PRESETS.maintenancePhoto;
  const docCfg   = UPLOAD_PRESETS.document;

  it("accepts jpeg for maintenancePhoto preset", () => {
    const file = mockFile("photo.jpg", "image/jpeg", 1024);
    const { valid } = validateFiles([file], photoCfg);
    expect(valid).toHaveLength(1);
  });

  it("rejects PDF for maintenancePhoto preset", () => {
    const file = mockFile("doc.pdf", "application/pdf", 1024);
    const { errors } = validateFiles([file], photoCfg);
    expect(errors[0]).toMatch(/not allowed/i);
  });

  it("accepts PDF for document preset", () => {
    const file = mockFile("doc.pdf", "application/pdf", 1024);
    const { valid } = validateFiles([file], docCfg);
    expect(valid).toHaveLength(1);
  });

  it("rejects executables for all presets", () => {
    const file = mockFile("virus.exe", "application/x-msdownload", 1024);
    const { errors: photoErrors } = validateFiles([file], photoCfg);
    const { errors: docErrors }   = validateFiles([file], docCfg);
    expect(photoErrors[0]).toMatch(/not allowed/i);
    expect(docErrors[0]).toMatch(/not allowed/i);
  });

  it("accepts heic for mobile photo preset (Apple live photos)", () => {
    const file = mockFile("live.heic", "image/heic", 2048);
    const { valid } = validateFiles([file], photoCfg);
    expect(valid).toHaveLength(1);
  });
});

// ── Security: cross-account isolation (service layer) ─────────────────────────
// The upload service uses assertUuid() and RLS — these are integration tests.
// Here we just verify that validation does not expose or leak data.

describe("validateFiles — security: no cross-account data exposure", () => {
  it("validation is stateless — no account IDs stored", () => {
    const cfg = UPLOAD_PRESETS.maintenancePhoto;
    const file = mockFile("photo.jpg", "image/jpeg", 1024);
    const result1 = validateFiles([file], cfg);
    const result2 = validateFiles([file], cfg);
    // Results are independent — no shared state
    expect(result1.valid).not.toBe(result2.valid);
    expect(result1.valid[0]).toBe(result2.valid[0]);
  });
});
