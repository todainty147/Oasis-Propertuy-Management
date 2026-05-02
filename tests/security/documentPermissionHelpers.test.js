import { describe, expect, it } from "vitest";

import {
  buildPermissionContext,
  canDeleteDocument,
  canEditDocumentTags,
  canUploadDocument,
} from "../../src/utils/permissions.js";

describe("document permission helpers", () => {
  it("keeps owner delete access enabled", () => {
    expect(canDeleteDocument("owner")).toBe(true);
  });

  it("keeps admin delete access disabled", () => {
    expect(canDeleteDocument("admin")).toBe(false);
  });

  it("blocks staff from deleting documents", () => {
    expect(canDeleteDocument("staff")).toBe(false);
  });

  it("allows staff to tag documents", () => {
    expect(canEditDocumentTags("staff")).toBe(true);
  });

  it("keeps staff upload access enabled", () => {
    expect(canUploadDocument("staff")).toBe(true);
  });

  it("resolves document helper access from dynamic permission keys", () => {
    const subject = buildPermissionContext("custom_staff", [
      "documents.read",
      "documents.upload",
      "documents.tag",
    ]);

    expect(canUploadDocument(subject)).toBe(true);
    expect(canEditDocumentTags(subject)).toBe(true);
    expect(canDeleteDocument(subject)).toBe(false);
  });
});
